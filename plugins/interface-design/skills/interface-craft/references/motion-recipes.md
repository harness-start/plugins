# Motion recipes

These recipes describe decisions, not copy-paste implementations. Use the project's existing primitives and tokens. Every recipe must preserve state, focus, interruption, exit, and reduced-motion behavior.

## Button press

Use only for pointer press confirmation. Apply a subtle scale or one-pixel translation while active and return immediately. Do not delay the action; keyboard activation uses the normal focus and state feedback.

## Popover / dropdown

Enter from the trigger's transform origin with opacity plus small scale or travel. Exit faster. Rapid close and reopen must cancel stale cleanup and resume from the current value. Preserve focus ownership and placement.

## Dialog

Keep the dialog centered; do not pretend it grows from a trigger. Coordinate backdrop and surface without hiding focus transfer. Closing returns focus to the invoker. Reduced motion keeps the modal state change and removes travel or scale.

## Accordion

Animate the disclosure only when expansion helps spatial continuity. Keep `aria-expanded`, content availability, and height measurement synchronized. Prefer a CSS grid or other state-driven construction that needs no timed display cleanup. Never use `setTimeout` to predict the end of the close transition; if cleanup cannot be avoided, use a filtered `transitionend` listener that confirms the disclosure is still closed. Interruption must settle at the latest open state; reduced motion changes state immediately even when no transition event fires.

## Tabs

Move an indicator only when it clarifies selection. Tab-panel content should not wait for decoration. Keyboard changes remain immediate, reading order stays stable, and reduced motion snaps the indicator.

## Toast

Use a short entrance that identifies where the status appeared and a faster exit. Do not animate away before assistive technology can announce it. Pause or extend dismissal when interaction requires it.

## Text/value swap

Keep the slot size stable and preserve the accessible value. Use a small crossfade or directional cue; avoid blur on frequently updating values. Rapid updates collapse to the latest value instead of queuing every intermediate animation.

## Skeleton/reveal

Reserve final layout space before loading. Replace the skeleton with content through a quiet transition that does not delay readiness. Reduced motion removes pulsing and cross-travel while retaining the state change.

## Validation feedback

Pair motion with text, iconography, and focus; motion is never the only error signal. A shake, if justified, is short, replayable, and absent under reduced motion. Repeated invalid submits must not accumulate timers or leave stale classes.
