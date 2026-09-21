mergeInto(LibraryManager.library, {
  CargoEvent: function(pointer) { if (window.cargoUnityEvent) window.cargoUnityEvent(JSON.parse(UTF8ToString(pointer))); }
});
