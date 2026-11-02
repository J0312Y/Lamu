// Spectral noise gating module for Lamu.
// Provides basic noise reduction via spectral subtraction + gain normalization.
// Designed to run in the audio capture pipeline before STT.

use std::collections::VecDeque;

/// Simple spectral noise gate with adaptive noise floor estimation.
pub struct SpectralNoiseGate {
    /// FFT frame size (must be power of 2)
    frame_size: usize,
    /// Hop between frames
    hop_size: usize,
    /// Noise floor estimate per frequency bin
    noise_floor: Vec<f32>,
    /// Number of frames used to estimate noise floor
    noise_frames_count: usize,
    /// Whether initial noise estimation is complete
    calibrated: bool,
    /// Number of frames to use for calibration (first ~0.5s)
    calibration_frames: usize,
    /// Over-subtraction factor (1.0 = exact, 2.0 = aggressive)
    alpha: f32,
    /// Spectral floor to prevent musical noise
    beta: f32,
    /// Input sample buffer
    input_buffer: VecDeque<f32>,
    /// Output sample buffer
    output_buffer: VecDeque<f32>,
    /// Hann window
    window: Vec<f32>,
    /// Target RMS for gain normalization
    target_rms: f32,
    /// Smoothing for gain (prevents abrupt changes)
    current_gain: f32,
}

impl SpectralNoiseGate {
    pub fn new(sample_rate: u32) -> Self {
        let frame_size = 1024;
        let hop_size = frame_size / 2;
        // ~0.5s of calibration at given sample rate
        let calibration_frames = ((sample_rate as f32 * 0.5) / hop_size as f32).ceil() as usize;

        let window: Vec<f32> = (0..frame_size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (frame_size - 1) as f32).cos())
            })
            .collect();

        Self {
            frame_size,
            hop_size,
            noise_floor: vec![0.0; frame_size / 2 + 1],
            noise_frames_count: 0,
            calibrated: false,
            calibration_frames,
            alpha: 2.0,
            beta: 0.02,
            input_buffer: VecDeque::with_capacity(frame_size * 4),
            output_buffer: VecDeque::with_capacity(frame_size * 4),
            window,
            target_rms: 0.1,
            current_gain: 1.0,
        }
    }

    /// Process a chunk of audio samples. Returns denoised samples.
    /// During calibration period, passes through audio while learning noise profile.
    pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        self.input_buffer.extend(samples.iter());

        while self.input_buffer.len() >= self.frame_size {
            // Extract frame
            let frame: Vec<f32> = self.input_buffer.iter().take(self.frame_size).copied().collect();
            // Advance by hop_size
            for _ in 0..self.hop_size {
                self.input_buffer.pop_front();
            }

            // Apply window
            let windowed: Vec<f32> = frame.iter().zip(&self.window).map(|(s, w)| s * w).collect();

            // Simple magnitude spectrum via DFT (we use a minimal real-valued approach)
            let magnitudes = self.compute_magnitude_spectrum(&windowed);

            if !self.calibrated {
                // Accumulate noise floor estimate
                for (i, &mag) in magnitudes.iter().enumerate() {
                    self.noise_floor[i] = (self.noise_floor[i] * self.noise_frames_count as f32 + mag)
                        / (self.noise_frames_count + 1) as f32;
                }
                self.noise_frames_count += 1;
                if self.noise_frames_count >= self.calibration_frames {
                    self.calibrated = true;
                }
                // Pass through during calibration
                for i in 0..self.hop_size {
                    self.output_buffer.push_back(frame[i]);
                }
            } else {
                // Spectral subtraction
                let gains: Vec<f32> = magnitudes
                    .iter()
                    .zip(&self.noise_floor)
                    .map(|(&mag, &noise)| {
                        let subtracted = mag - self.alpha * noise;
                        if subtracted > self.beta * mag {
                            subtracted / mag.max(1e-10)
                        } else {
                            self.beta
                        }
                    })
                    .collect();

                // Apply gains to frame (simplified: apply average gain per hop)
                let avg_gain: f32 = gains.iter().sum::<f32>() / gains.len() as f32;
                let avg_gain = avg_gain.clamp(0.0, 1.0);

                for i in 0..self.hop_size {
                    self.output_buffer.push_back(frame[i] * avg_gain);
                }

                // Slowly update noise floor with silence frames
                let frame_rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();
                if frame_rms < self.noise_floor.iter().sum::<f32>() / self.noise_floor.len() as f32 * 1.5 {
                    // This frame is likely noise — slowly adapt
                    let adapt_rate = 0.01;
                    for (i, &mag) in magnitudes.iter().enumerate() {
                        self.noise_floor[i] = self.noise_floor[i] * (1.0 - adapt_rate) + mag * adapt_rate;
                    }
                }
            }
        }

        // Drain output buffer
        let result: Vec<f32> = self.output_buffer.drain(..).collect();

        // Gain normalization
        if !result.is_empty() {
            let rms = (result.iter().map(|s| s * s).sum::<f32>() / result.len() as f32).sqrt();
            if rms > 0.001 {
                let desired_gain = self.target_rms / rms;
                let desired_gain = desired_gain.clamp(0.5, 4.0);
                // Smooth gain changes
                self.current_gain = self.current_gain * 0.95 + desired_gain * 0.05;
                return result.iter().map(|s| (s * self.current_gain).clamp(-1.0, 1.0)).collect();
            }
        }

        result
    }

    /// Simple magnitude spectrum using DFT approximation.
    /// For real-time performance, we compute a reduced-bin spectrum.
    fn compute_magnitude_spectrum(&self, frame: &[f32]) -> Vec<f32> {
        let n = self.frame_size;
        let num_bins = n / 2 + 1;
        let mut magnitudes = vec![0.0f32; num_bins];

        // Downsample the DFT to 64 bins for performance
        let target_bins = 64.min(num_bins);
        let bin_ratio = num_bins as f32 / target_bins as f32;

        for k in 0..target_bins {
            let freq_bin = (k as f32 * bin_ratio) as usize;
            let mut real = 0.0f32;
            let mut imag = 0.0f32;
            let w = 2.0 * std::f32::consts::PI * freq_bin as f32 / n as f32;
            // Subsample for speed (every 4th sample)
            let step = 4.min(n);
            for i in (0..n).step_by(step) {
                let angle = w * i as f32;
                real += frame[i] * angle.cos();
                imag -= frame[i] * angle.sin();
            }
            let mag = (real * real + imag * imag).sqrt() * (step as f32);
            // Spread to nearby bins
            let start = (k as f32 * bin_ratio) as usize;
            let end = ((k + 1) as f32 * bin_ratio) as usize;
            for b in start..end.min(num_bins) {
                magnitudes[b] = mag;
            }
        }

        magnitudes
    }

    /// Reset the noise gate (recalibrate)
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.noise_floor.fill(0.0);
        self.noise_frames_count = 0;
        self.calibrated = false;
        self.input_buffer.clear();
        self.output_buffer.clear();
        self.current_gain = 1.0;
    }

    /// Check if calibration is done
    #[allow(dead_code)]
    pub fn is_calibrated(&self) -> bool {
        self.calibrated
    }
}

/// Simple gain normalization for a buffer of samples.
/// Adjusts RMS to target level without clipping.
#[allow(dead_code)]
pub fn normalize_gain(samples: &mut [f32], target_rms: f32) {
    if samples.is_empty() {
        return;
    }
    let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
    if rms < 0.001 {
        return; // silence — don't amplify noise
    }
    let gain = (target_rms / rms).clamp(0.5, 4.0);
    for s in samples.iter_mut() {
        *s = (*s * gain).clamp(-1.0, 1.0);
    }
}

/// Speech rate estimation (syllables per second approximation).
/// Uses zero-crossing rate as a rough proxy for speech rate.
#[allow(dead_code)]
pub fn estimate_speech_rate(samples: &[f32], sample_rate: u32) -> f32 {
    if samples.len() < sample_rate as usize / 10 {
        return 0.0; // too short
    }
    let mut crossings = 0u32;
    for w in samples.windows(2) {
        if (w[0] >= 0.0 && w[1] < 0.0) || (w[0] < 0.0 && w[1] >= 0.0) {
            crossings += 1;
        }
    }
    let duration = samples.len() as f32 / sample_rate as f32;
    crossings as f32 / (2.0 * duration) // approximate Hz → syllables
}
