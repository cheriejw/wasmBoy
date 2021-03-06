// Need to add a return value, and force all code in the block to be sync
// https://stackoverflow.com/questions/7255649/window-onbeforeunload-not-working
// http://vaughnroyko.com/idbonbeforeunload/
// https://bugzilla.mozilla.org/show_bug.cgi?id=870645

// Solution:
// ~~Try to force sync: https://www.npmjs.com/package/deasync~~ Didn't work, requires fs
// Save to local storage, and pick it back up in init: https://bugs.chromium.org/p/chromium/issues/detail?id=144862

// import Functions involving GB and WasmBoy memory
import { getCartridgeHeader } from './header.js';
import { getCartridgeRam } from './ram.js';
import { getSaveState, loadSaveState } from './state.js';

// Function to create a save state, and store it as a localstorage token
const _prepareAndStoreAutoSave = wasmboyMemory => {
  // Check if the game is currently playing
  if (!wasmboyMemory || !wasmboyMemory.wasmInstance || wasmboyMemory.wasmInstance.exports.hasCoreStarted() <= 0) {
    return null;
  }

  // Get our cartridge ram and header
  const header = getCartridgeHeader(wasmboyMemory);
  const cartridgeRam = getCartridgeRam(wasmboyMemory);

  // Get our save state, and un type our arrays
  const saveState = getSaveState(wasmboyMemory);
  const saveStateMemoryKeys = Object.keys(saveState.wasmboyMemory);
  for (let i = 0; i < saveStateMemoryKeys.length; i++) {
    saveState.wasmboyMemory[saveStateMemoryKeys[i]] = Array.prototype.slice.call(saveState.wasmboyMemory[saveStateMemoryKeys[i]]);
  }

  // Set isAuto
  saveState.isAuto = true;

  // Need to conert types arrays, and back, or selse wll get indexed JSON
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays
  localStorage.setItem(
    wasmboyMemory.WASMBOY_UNLOAD_STORAGE,
    JSON.stringify({
      header: Array.prototype.slice.call(header),
      cartridgeRam: Array.prototype.slice.call(cartridgeRam),
      saveState: saveState
    })
  );

  return null;
};

// Function to find any autosaves in localstorage, and commit them to our idb
const _findAndCommitAutoSave = wasmboyMemory => {
  const findAndCommitAutoSaveTask = async () => {
    // Load any unloaded storage in our localStorage
    const unloadStorage = localStorage.getItem(wasmboyMemory.WASMBOY_UNLOAD_STORAGE);
    if (unloadStorage) {
      const unloadStorageObject = JSON.parse(unloadStorage);
      localStorage.removeItem(wasmboyMemory.WASMBOY_UNLOAD_STORAGE);

      const header = new Uint8Array(unloadStorageObject.header);
      const cartridgeRam = new Uint8Array(unloadStorageObject.cartridgeRam);

      // Get our save state, and re-type our array
      const saveState = unloadStorageObject.saveState;
      if (saveState) {
        const saveStateMemoryKeys = Object.keys(saveState.wasmboyMemory);
        for (let i = 0; i < saveStateMemoryKeys.length; i++) {
          saveState.wasmboyMemory[saveStateMemoryKeys[i]] = new Uint8Array(saveState.wasmboyMemory[saveStateMemoryKeys[i]]);
        }
      }

      await wasmboyMemory.saveCartridgeRam(header, cartridgeRam);
      await wasmboyMemory.saveState(header, saveState);
    }
  };

  return findAndCommitAutoSaveTask();
};

// Function to set event listeners to run our unload handler
export const initializeAutoSave = wasmboyMemory => {
  // Set listeners to ensure we save our cartridge ram before closing
  window.addEventListener(
    'beforeunload',
    () => {
      _prepareAndStoreAutoSave(wasmboyMemory);
    },
    false
  );
  window.addEventListener(
    'unload',
    () => {
      _prepareAndStoreAutoSave(wasmboyMemory);
    },
    false
  );
  window.addEventListener(
    'pagehide',
    () => {
      _prepareAndStoreAutoSave(wasmboyMemory);
    },
    false
  );
  // Mobile Page visibility, for pressing home, closing tabs, task switcher, etc...
  // https://www.igvita.com/2015/11/20/dont-lose-user-and-app-state-use-page-visibility/
  document.addEventListener('visibilitychange', () => {
    // fires when user switches tabs, apps, goes to homescreen, etc.
    if (document.visibilityState === 'hidden') {
      _prepareAndStoreAutoSave(wasmboyMemory);
    }
  });

  // Restore any autosave lingering to be committed
  return _findAndCommitAutoSave(wasmboyMemory);
};
