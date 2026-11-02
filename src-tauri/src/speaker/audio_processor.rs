// Audio processor module for Lamu.
// Provides accent normalization features:
// - Speech rate normalization (time-stretch)
// - Gain normalization (consistent volume)
// - Pitch smoothing (reduce extreme pitch variations)

/// Normalize speech rate by resampling audio.
/// Speeds up or slows down audio to match target words-per-minute.
/// Uses linear interpolation for simplicity and low latency.
#[allow(dead_code)]
pub fn normalize_speech_rate(samples: &[f32], current_rate: f32, target_rate: f32) -> Vec<f32> {
    if samples.is_empty() || current_rate <= 0.0 || target_rate <= 0.0 {
        return samples.to_vec();
    }

    let ratio = current_rate / target_rate;
    // Clamp ratio to avoid extreme changes
    let ratio = ratio.clamp(0.7, 1.4);

    if (ratio - 1.0).abs() < 0.05 {
        return samples.to_vec(); // Close enough, no change needed
    }

    let new_len = (samples.len() as f32 / ratio) as usize;
    let mut result = Vec::with_capacity(new_len);

    for i in 0..new_len {
        let src_pos = i as f32 * ratio;
        let idx = src_pos as usize;
        let frac = src_pos - idx as f32;

        if idx + 1 < samples.len() {
            // Linear interpolation
            let sample = samples[idx] * (1.0 - frac) + samples[idx + 1] * frac;
            result.push(sample);
        } else if idx < samples.len() {
            result.push(samples[idx]);
        }
    }

    result
}

/// Apply pitch smoothing to reduce extreme pitch variations.
/// Uses a simple moving average on the signal envelope to smooth transitions.
pub fn smooth_pitch(samples: &mut [f32], window_size: usize) {
    if samples.len() < window_size || window_size < 2 {
        return;
    }

    // Compute envelope (absolute values)
    let envelope: Vec<f32> = samples.iter().map(|s| s.abs()).collect();

    // Smooth envelope with moving average
    let mut smoothed_env = vec![0.0f32; samples.len()];
    let half_win = window_size / 2;

    for i in 0..samples.len() {
        let start = i.saturating_sub(half_win);
        let end = (i + half_win + 1).min(samples.len());
        let sum: f32 = envelope[start..end].iter().sum();
        smoothed_env[i] = sum / (end - start) as f32;
    }

    // Apply smoothed envelope
    for i in 0..samples.len() {
        if envelope[i] > 0.001 {
            let scale = smoothed_env[i] / envelope[i];
            let scale = scale.clamp(0.5, 2.0);
            samples[i] *= scale;
        }
    }
}

/// Adaptive gain normalization per segment.
/// Divides audio into segments and normalizes each to target RMS.
pub fn adaptive_gain_normalize(samples: &mut [f32], sample_rate: u32, target_rms: f32) {
    let segment_size = sample_rate as usize / 4; // 250ms segments
    if segment_size == 0 {
        return;
    }

    for chunk in samples.chunks_mut(segment_size) {
        let rms = (chunk.iter().map(|s| s * s).sum::<f32>() / chunk.len() as f32).sqrt();

        if rms > 0.002 {
            // Only normalize non-silent segments
            let gain = (target_rms / rms).clamp(0.3, 5.0);
            for s in chunk.iter_mut() {
                *s = (*s * gain).clamp(-1.0, 1.0);
            }
        }
    }
}

/// De-emphasis filter for reducing sibilance (high-frequency harshness).
/// Simple first-order low-pass with gentle rolloff.
#[allow(dead_code)]
pub fn de_emphasis(samples: &mut [f32], coefficient: f32) {
    let coeff = coefficient.clamp(0.0, 0.99);
    if samples.is_empty() {
        return;
    }
    let mut prev = samples[0];
    for i in 1..samples.len() {
        samples[i] = samples[i] + coeff * prev;
        prev = samples[i];
    }
    // Re-normalize to prevent clipping
    let max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    if max > 1.0 {
        for s in samples.iter_mut() {
            *s /= max;
        }
    }
}
