# Audio-conditioned listening investigation

Status: **investigation complete; neither local route passed calibration, and no model listening approval of the music is available.** This is secondary model evidence, not human hearing. No production audio was changed during this investigation. The twelve music windows and four audiovisual windows were deliberately not evaluated with an uncalibrated route.

## Method

Test a local audio-conditioned model against independently known controls before asking it to describe the artwork. Do not put the ground truth, intended genre, title, score, production method or source timecodes into the prompt. Require believable control responses before the twelve planned music windows. A calibration gate prevents the music stage from running after a failed control evaluation.

Model: `nativ-community/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-4bit`; pinned revision `75c89904e1c2a045098d9111e7cb250a4d8adcec`; local `mlx-vlm`. Exact runtime version, prompts, source hash and settings are in `runs/psy-audio-listening-v01/metadata.json`. Temperature 0; thinking disabled. Inputs are conditioned through `audio=[path]` with one audio token in the chat template. Control raw outputs include the fully formatted template, generation token count, elapsed time, timestamp and file hash.

The source intended for later listening is `runs/psytrance-audio-v02/phase-bloom-master.wav`. Planned windows begin at 0, 40, 100, 155, 210, 265, 286, 365, 425, 440, 498 and 570 seconds. Each would be 24 seconds, or 30 seconds around key transitions/endings. The model audio input is 16 kHz mono PCM; it cannot establish stereo image quality. These windows have **not** been evaluated because the gate is closed.

## Controls and observed results

| Control | Independent ground truth | Observed model output | Assessment |
|---|---|---|---|
| Tone, original CLI | Six seconds of constant 440 Hz sine, no voice or beat | “The sound of a drum is playing.” | Failed: invented percussion |
| Tone, Python API | Same verified file | Empty response; one generated token, stop | Unusable |
| Speech, Python API | macOS speech: “The tide is turning. This is a spoken sentence without music.” | Empty response; one generated token, stop | Unusable |
| Surf, Python API | Artificial filtered-noise/wave envelopes from the earlier sea sample; no voice, music or guitar | Empty response; one generated token, stop | Unusable |

The tone was independently inspected from PCM: 16 kHz mono, 96,000 samples, dominant frequency exactly 440 Hz, RMS 0.0883708; every half-second has the same RMS to five decimal places. This rules out a hidden drum beat in the control. The model result cannot be treated as evidence about the actual score.

Raw original CLI logs: `runs/psy-audio-calibration/nemotron-tone-v2.txt` and `.log`. Tone verification: `tone-validation.json` in that directory. Three API outputs: `runs/psy-audio-listening-v01/control_01.json` through `control_03.json`. The one-load API run used approximately 20.18 GB peak model memory and loaded in 7.7 seconds. Audio-dependent prompt lengths differed between controls, but that alone does not prove correct acoustic understanding.

A final bounded CLI speech-transcription retry also produced an empty response (`runs/psy-audio-calibration/nemotron-speech-cli.txt` and `.log`). The Nemotron attempt is closed as unusable. Failed or empty controls are not used to invent a music review.

## Last alternate model attempt

The parent authorized a final local attempt with [mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit](https://huggingface.co/mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit), a different generation from the previously rejected Qwen2 audio model. Its model card documents the MLX conversion and `mlx-vlm` use. Revision: `93b3cbddd65ed4babff8f22fba491cdba7a21778`. Initial tone-control logs are `runs/psy-audio-calibration/qwen3-tone.txt` and `.log`. The first run failed with a Metal insufficient-memory error during audio embedding; it produced no perceptual result.

The prepared Qwen3 harness targets the final delivery `runs/dp-sts-v01/dp-sts.wav`, whose title is **dp-sts**. Relative to the original v02 render, the delivery applies a uniform −1.5 dB safety gain; musical content and timing are unchanged. A passed gate would have generated twelve audio-window reports and four joint audio/video reports from the same resident model. Planned video windows: 287–299, 447–459, 502–514 and 588–600 seconds. Native video processing support is checked before inference; clips would be sampled at 8 fps, 384×216, at most 96 frames each. Such reports could not establish full 30 fps smoothness or frame-exact musical synchronization. **The gate failed, so these reports were not generated.**

The machine had two unrelated resident Ollama servers using approximately 38 GB combined RSS. They were neither stopped nor unloaded. One bounded memory repair used the installed model's official `disable_talker()` and `save_weights()`/`save_config()` APIs to make a task-local understanding-only export on CPU, followed by the official `mlx_vlm.moe_offload.repack` operation. This excluded speech-generation components and avoided mixing the model's two MoE branches in a repacker keyed by layer number. Inference used a 2 GB expert cache, a 128 MB allocator cache, and 16-token prefill chunks. Original downloaded checkpoint files and system/model settings were untouched. The repaired process loaded in 1.2 seconds and peaked at approximately 5.46 GB.

| Qwen3 repaired-runtime control | Actual text | Assessment |
|---|---|---|
| Constant 440 Hz tone | `<\|endoftext\|>人` | Unusable special-token/fragment output |
| Known spoken sentence | `<\|endoftext\|>` | Failed to describe or transcribe speech |
| Synthesized surf noise | `<\|endoftext\|><\|im_start\|>,` | Unusable special-token/fragment output |

Raw outputs are `runs/psy-audio-listening-v01/qwen3/control_01.json` through `control_03.json`, with prompts, file hashes, token counts, timings and timestamps. The rejected gate is in that directory's `gate.json`; its `metadata.json` identifies the original model revision and task-local runtime transformation. Preparation logs and the reproducible preparation script are under `runs/psy-audio-calibration/`. Both model processes exited after rejection; no model remains resident from this investigation.

These failures may reflect checkpoint/runtime/template compatibility rather than a general limitation of the underlying model family. They are not adverse evidence about the artwork's music. They do establish that **this local route did not provide trustworthy perceptual evidence**, so no music or motion scores are awarded from it.

## Prior attempts and limits

The parent agent reported that a previous Qwen audio model hallucinated voice and guitar on the synthetic surf control and was excluded. A separate `mlx-community` Nemotron checkpoint failed weight loading. Those attempts are not counted as listening evidence here. The currently tested `nativ-community` checkpoint does load, but loading successfully is not a calibration pass.

The technical audio checks—duration, loudness, true peak, arrangement events and measured spectral synchronization—remain valid for their narrow purposes. They do not establish that timbres, transitions or the complete piece satisfy the artistic brief. The listening gap must remain explicit if no trustworthy calibrated route is available.

## External control-only attempt

After the local failures, the parent tried the official [Qwen3-Omni Captioner demo](https://huggingface.co/spaces/Qwen/Qwen3-Omni-Captioner-Demo) through `gradio_client`. The Space reported `RUNNING`; inspection of its `app.py` showed that it forwards audio to an Alibaba DashScope captioner. **Only a newly generated generic 440 Hz test tone was submitted. No artwork, user image, or earlier surf sample was uploaded.** The `/on_submit` call used temperature 0.1, top_p 0.95 and top_k 20, and failed with `gradio_client.exceptions.AppError`: the upstream application raised an exception with verbose errors disabled. No external perceptual result was obtained.

Direct listener feedback has now been requested from the user as actual perceptual evidence. Artistic approval remains open, and the overall quality goal is not complete.
