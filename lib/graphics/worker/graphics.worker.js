// Web worker for wasmboy lib
// Will be used for running wasm, and controlling child workers.

onmessage = event => {
  // Handle our messages from the main thread
  switch (event.data.command) {
    case 'connect': {
      // Simply post back that we are ready
      postMessage('Connected!');
      return;
    }

    default: {
      //handle other messages from main
      console.log(event.data);
    }
  }
};