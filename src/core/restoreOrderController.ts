type RestorableOrderController = {
  saved: () => Promise<unknown>;
  dispose: () => void;
};
// The effect owns this controller. Late secure-store reads cannot publish after withdrawal.
export function restoreOrderController(controller: RestorableOrderController, ready: () => void) {
  let active = true;
  void controller
    .saved()
    .catch(() => undefined)
    .then(() => {
      if (active) ready();
    });
  return () => {
    active = false;
    controller.dispose();
  };
}
