import type { Subscription } from "rxjs"
import { DisposableLike } from "atom"

// convert rxjs Subscription to Atom DisposableLike (rename unsubscribe to dispose)
export function disposableFromSubscription(subs: Subscription): DisposableLike {
  return { ...subs, dispose: subs.unsubscribe }
}
