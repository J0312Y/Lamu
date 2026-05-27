// Cross-platform microphone capture using CPAL.
// Uses the same Stream<Item=f32> interface as SpeakerStream so the VAD
// pipeline in commands.rs can process mic audio identically.

use anyhow::Result;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::Stream;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::task::{Poll, Waker};
use std::thread;
use std::time::Duration;

struct WakerState {
    waker: Option<Waker>,
    has_data: bool,
    shutdown: bool,
}

pub struct MicStream {
    sample_queue: Arc<Mutex<VecDeque<f32>>>,
    waker_state: Arc<Mutex<WakerState>>,
    capture_thread: Option<thread::JoinHandle<()>>,
    sample_rate: u32,
}

impl MicStream {
    pub fn new(device_id: Option<String>) -> Result<Self> {
        let sample_queue = Arc::new(Mutex::new(VecDeque::<f32>::new()));
        let waker_state = Arc::new(Mutex::new(WakerState {
            waker: None,
            has_data: false,
            shutdown: false,
        }));

        let (init_tx, init_rx) = std::sync::mpsc::channel::<Result<u32>>();

        let q_thread = sample_queue.clone();
        let ws_thread = waker_state.clone();
        let ws_shutdown = waker_state.clone();

        let capture_thread = thread::spawn(move || {
            // Phase 1: open device and start stream
            let init_result: Result<(cpal::Stream, u32)> = (|| {
                let host = cpal::default_host();

                let device = if let Some(ref id) = device_id {
                    host.input_devices()?
                        .find(|d| d.name().ok().as_deref() == Some(id.as_str()))
                        .ok_or_else(|| anyhow::anyhow!("Mic device not found: {}", id))?
                } else {
                    host.default_input_device()
                        .ok_or_else(|| anyhow::anyhow!("No default mic device available"))?
                };

                let supported = device.default_input_config()?;
                let sample_rate = supported.sample_rate().0;
                let channels = supported.channels() as usize;

                let config = cpal::StreamConfig {
                    channels: supported.channels(),
                    sample_rate: supported.sample_rate(),
                    buffer_size: cpal::BufferSize::Default,
                };

                // Shared push fn via Arc to avoid cloning large closures per format
                let pusher: Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static> = {
                    let q = q_thread.clone();
                    let ws = ws_thread.clone();
                    Arc::new(move |mono: Vec<f32>| {
                        {
                            let mut queue = q.lock().unwrap();
                            queue.extend(&mono);
                            // Cap at 128K samples to avoid unbounded memory
                            if queue.len() > 131_072 {
                                let excess = queue.len() - 131_072;
                                queue.drain(..excess);
                            }
                        }
                        let mut state = ws.lock().unwrap();
                        if !state.has_data {
                            state.has_data = true;
                            if let Some(waker) = state.waker.take() {
                                drop(state);
                                waker.wake();
                            }
                        }
                    })
                };

                let err_fn = |err: cpal::StreamError| {
                    eprintln!("[Lamu Mic] Stream error: {}", err);
                };

                let stream: cpal::Stream = match supported.sample_format() {
                    cpal::SampleFormat::F32 => {
                        let push = pusher.clone();
                        device.build_input_stream(
                            &config,
                            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                                push(to_mono_f32(data, channels));
                            },
                            err_fn,
                            None,
                        )?
                    }
                    cpal::SampleFormat::I16 => {
                        let push = pusher.clone();
                        device.build_input_stream(
                            &config,
                            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                                let floats: Vec<f32> = data
                                    .iter()
                                    .map(|&s| s as f32 / i16::MAX as f32)
                                    .collect();
                                push(to_mono_f32(&floats, channels));
                            },
                            err_fn,
                            None,
                        )?
                    }
                    cpal::SampleFormat::U16 => {
                        let push = pusher.clone();
                        device.build_input_stream(
                            &config,
                            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                                let floats: Vec<f32> = data
                                    .iter()
                                    .map(|&s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                                    .collect();
                                push(to_mono_f32(&floats, channels));
                            },
                            err_fn,
                            None,
                        )?
                    }
                    fmt => {
                        return Err(anyhow::anyhow!(
                            "Unsupported mic sample format: {:?}",
                            fmt
                        ));
                    }
                };

                stream.play()?;
                Ok((stream, sample_rate))
            })();

            match init_result {
                Ok((_stream, sample_rate)) => {
                    let _ = init_tx.send(Ok(sample_rate));
                    // Phase 2: keep thread alive so _stream is not dropped
                    loop {
                        thread::sleep(Duration::from_millis(50));
                        if ws_shutdown.lock().unwrap().shutdown {
                            break;
                        }
                    }
                    // _stream drops here → CPAL stops capturing
                }
                Err(e) => {
                    let _ = init_tx.send(Err(e));
                }
            }
        });

        let sample_rate = init_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| anyhow::anyhow!("Mic initialization timed out"))??;

        Ok(MicStream {
            sample_queue,
            waker_state,
            capture_thread: Some(capture_thread),
            sample_rate,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

fn to_mono_f32(data: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    data.chunks(channels)
        .map(|ch| ch.iter().sum::<f32>() / channels as f32)
        .collect()
}

impl Stream for MicStream {
    type Item = f32;

    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        // Check for shutdown first
        {
            let state = self.waker_state.lock().unwrap();
            if state.shutdown {
                return Poll::Ready(None);
            }
        }

        // Fast path: data already in queue
        {
            let mut queue = self.sample_queue.lock().unwrap();
            if let Some(s) = queue.pop_front() {
                return Poll::Ready(Some(s));
            }
        }

        // Register waker and do a final check to avoid race
        {
            let mut state = self.waker_state.lock().unwrap();
            if state.shutdown {
                return Poll::Ready(None);
            }
            state.has_data = false;
            state.waker = Some(cx.waker().clone());
            drop(state);
        }

        {
            let mut queue = self.sample_queue.lock().unwrap();
            match queue.pop_front() {
                Some(s) => Poll::Ready(Some(s)),
                None => Poll::Pending,
            }
        }
    }
}

impl Drop for MicStream {
    fn drop(&mut self) {
        {
            let mut state = self.waker_state.lock().unwrap();
            state.shutdown = true;
            if let Some(waker) = state.waker.take() {
                drop(state);
                waker.wake();
            }
        }
        if let Some(thread) = self.capture_thread.take() {
            let _ = thread.join();
        }
    }
}
