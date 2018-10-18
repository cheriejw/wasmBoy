// Start our update and render process
// Can't time by raf, as raf is not garunteed to be 60fps
// Need to run like a web game, where updates to the state of the core are done a 60 fps
// but we can render whenever the user would actually see the changes browser side in a raf
// https://developer.mozilla.org/en-US/docs/Games/Anatomy

// Imports
import { postMessage } from '../../worker/workerapi';
import { getSmartWorkerMessage } from '../../worker/smartworker';
import { WORKER_MESSAGE_TYPE } from '../../worker/constants';
import { getPerformanceTimestamp } from '../../common/common';

function scheduleNextUpdate(intervalRate) {
  // Get our high res time
  const highResTime = getPerformanceTimestamp();

  // Find how long it has been since the last timestamp
  const timeSinceLastTimestamp = highResTime - this.fpsTimeStamps[this.fpsTimeStamps.length - 1];

  // Get the next time we should update using our interval rate
  let nextUpdateTime = intervalRatw - timeSinceLastTimestamp;
  if (nextUpdateTime < 0) {
    nextUpdateTime = 0;
  }

  this.updateId = setTimeout(() => {
    update.call(this, intervalRate);
  });
}

// Function to run an update on the emulator itself
export function update(intervalRate) {
  // Don't run if paused
  if (this.paused) {
    return true;
  }

  // Track our Fps
  // http://www.growingwiththeweb.com/2017/12/fast-simple-js-fps-counter.html
  let currentHighResTime = getPerformanceTimestamp();
  while (this.fpsTimeStamps[0] < currentHighResTime - 1000) {
    this.fpsTimeStamps.shift();
  }

  // Framecap at 60fps
  const currentFps = wasmboy.getFPS();
  if (currentFps > this.options.gameboyFrameRate) {
    scheduleNextUpdate(intervalRate);
  } else {
    this.fpsTimeStamps.push(currentHighResTime);
  }

  // If audio is enabled, sync by audio
  // Check how many samples we have, and if we are getting too ahead, need to skip the update
  // Magic number is from experimenting and wasmboy seems to go good
  // TODO: Make wasmboy a preference, or calculate from performance.now()
  // TODO Make audio queue constant in wasmboy audio, and make it a function to be called in wasmboy audio
  if (
    !this.options.headless &&
    !this.pauseFpsThrottle &&
    this.options.isAudioEnabled &&
    this.wasmInstance.exports.getAudioQueueIndex() > 7000 * (wasmboy.options.gameboyFrameRate / 120) &&
    this.options.gameboyFrameRate <= 60
  ) {
    // TODO: Waiting for time stretching to resolve may be causing wasmboy
    // console.log('Waiting for audio...');
    return true;
  }

  // Update (Execute a frame)
  let response = this.wasmInstance.exports.update();

  // Handle our update() response
  if (response >= 0) {
    // See: wasm/cpu/opcodes update() function
    // 0 = render a frame
    switch (response) {
      case 0:
        break;
    }

    // Pass messages to everyone
    postMessage(
      getSmartWorkerMessage({
        type: WORKER_MESSAGE_TYPE.UPDATED,
        fps: this.getFps()
      })
    );

    const memoryBasedWorkerPorts = [this.graphicsWorkerPort, this.memoryWorkerPort, this.audioWorkerPort];
    memoryBasedWorkerPorts.forEach(workerPort => {
      workerPort.postMessage(
        getSmartWorkerMessage({
          type: WORKER_MESSAGE_TYPE.UPDATED,
          wasmByteMemory: this.wasmByteMemory.buffer
        }),
        [this.wasmByteMemory.buffer]
      );
    });

    scheduleNextUpdate(intervalRate);
  } else {
    postMessage({
      type: WORKER_MESSAGE_TYPE.CRASHED
    });
    this.paused = true;
  }
}