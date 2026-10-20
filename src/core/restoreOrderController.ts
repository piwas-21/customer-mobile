type RestorablePrivateController = {
  saved: () => Promise<unknown>;
  dispose: () => void;
};
// The effect owns this private operation controller. Late secure-store reads cannot publish after withdrawal.
export function restoreOrderController(controller: RestorablePrivateController, ready: () => void) {
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
