# RM Tally Lights

Control an **RM Tally Lights** system from Companion — camera tally states and the
On Air light — without hand-typing HTTP URLs into Generic HTTP actions.

RM Tally Lights is an ESP32-based tally system: a master node hosts a web UI and
relays state over ESP-NOW to camera tally lights (LED matrices) and to an On Air
light (a relay). This module talks to the master's HTTP API and, from
firmware v1.3.0, its WebSocket state channel.

## Configuration

| Field               | Notes                                                              |
| ------------------- | ------------------------------------------------------------------ |
| **Master address**  | IP or hostname of the master, e.g. `192.168.0.76` or `tally.local` |
| **Port**            | `80` unless you have changed it                                    |
| **Request timeout** | `10000` ms by default — see the note below before lowering it      |

When you save the connection the module makes up to three HTTP requests: a
probe to `/test` to confirm the master is reachable — the same probe the
**Status indicator** section below reports on — then, if the master
answered, a read of your camera list so actions and feedbacks can show real
camera names, then it opens a single WebSocket to the master, whose connect
handler reads the camera list a second time in case anything changed while
the module was offline. That is one request against an unreachable master
(just the probe), and two against firmware older than v1.3.0, since there is
no socket to reconnect over. Once the socket does open, it usually pushes a
complete state snapshot immediately, and again whenever anything changes, so
**nothing is polled after that** — one persistent connection replaces what
would otherwise be a request every couple of seconds. ("Usually": the master
caps how many sockets it primes at once — see the client-cap note under
**Feedbacks** below for the exception and what it means for feedbacks,
variables and camera names.)

If the socket has never managed to open at all — an older master, a blocked
port — every action still works exactly as before, and feedbacks and
variables simply stay at their inactive defaults: no camera reports live or
preview, and `$(rm-tallylights:onair)` reads `offair`.

If the socket drops after having been open — a reboot, a network blip — the
module deliberately keeps the last snapshot it received rather than blanking
it, on the basis that a stale tally is more useful mid-show than a dark one:
**Camera is Live**, **Camera is Preview**, **On Air is On** and their matching
variables keep reporting whatever they last knew. Only **Master is Connected**
reflects the drop immediately; the rest usually catch up on the next
successful reconnect (see the client-cap note under **Feedbacks** for the case
where even that reconnect is delayed). Actions are unaffected either way,
since they never depended on the socket.

### Don't lower the timeout much

`All Cameras Off` and `All Cameras Idle` make the master contact every camera in
turn before it replies, and each one costs roughly 100 ms — more if a camera is
powered off. With a large or partly-offline camera set these can legitimately take
several seconds. If the timeout expires first, Companion reports a failure and
turns the connection red **even though the master carried the command out**.

## Actions

| Action                   | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| Set Camera Live          | That camera's tally turns red                         |
| Set Camera Preview       | Green                                                 |
| Set Camera Idle          | White                                                 |
| Set Camera Off           | Off                                                   |
| Set Live + Preview       | Sets both at once — the ATEM-style integration action |
| Auto (swap live/preview) | Swaps the current live and preview cameras            |
| All Cameras Idle         | Every camera white                                    |
| All Cameras Off          | Every camera off                                      |
| Set On Air Lights On     | Energises the On Air relay                            |
| Set On Air Lights Off    | Releases it                                           |

## Feedbacks

All four are boolean feedbacks, so you choose the colours.

| Feedback                | Lights when                                         |
| ----------------------- | --------------------------------------------------- |
| **Camera is Live**      | The master reports that camera as live              |
| **Camera is Preview**   | The master reports that camera as preview           |
| **On Air is On**        | The On Air light is on                              |
| **Master is Connected** | The module's state connection to the master is open |

The two camera feedbacks use the same camera picker as the actions: choose from
the dropdown, or pick **Manual entry…** and type a number.

**Master is Connected** follows the WebSocket only — it does not go red because
a single command was rejected. A failed command means one request failed; a
dropped connection means the master is gone, and during a show those need
different reactions. It is also independent of the green/red connection dot in
Companion's connections list (see **Status indicator** below): that dot tracks
the HTTP side, so it can be green while this feedback is false, or the other
way round.

The master accepts at most four `/ws` clients at once and evicts the _oldest_
when a fifth connects. Because the Companion module typically connects once and
stays connected for an entire show, it is usually the _oldest_ client — so if
someone opens the master's own web UI in a browser partway through and a fifth
`/ws` client shows up, it is the module's socket that gets evicted, not the new
tab's, which shows up as **Master is Connected** flapping even though nothing
is actually wrong.

The same cap can also bite on the very first connect, not only a reconnect: if
four of the master's own tabs are already open when you save the connection,
the module's socket arrives as the fifth and the firmware skips priming it.
Either way, an unprimed socket still flips **Master is Connected** true
immediately — the WebSocket's "open" event fires whether or not a first frame
follows — while the tally feedbacks (**Camera is Live**, **Camera is Preview**,
**On Air is On**) and the variables that mirror them hold whatever they last
knew until the next real state change arrives. Camera _names_ are the
exception: the module re-reads the camera list over a plain HTTP request on
every reconnect, independently of whether the socket was primed, so dropdown
labels, preset labels and `live_cam_name`/`preview_cam_name` refresh
immediately even while the tally numbers do not. Closing unused browser tabs
on the master's web UI reduces how often any of this happens.

Requires master firmware **v1.3.0 or newer**. Against older firmware the actions
work and the feedbacks stay inactive.

## Variables

| Variable                             | Example       | Notes                            |
| ------------------------------------ | ------------- | -------------------------------- |
| `$(rm-tallylights:live_cam)`         | `2`           | `0` when nothing is live         |
| `$(rm-tallylights:preview_cam)`      | `1`           | `0` when nothing is in preview   |
| `$(rm-tallylights:live_cam_name)`    | `Canon`       | Empty when nothing is live       |
| `$(rm-tallylights:preview_cam_name)` | `Main Camera` | Empty when nothing is in preview |
| `$(rm-tallylights:onair)`            | `onair`       | `onair` or `offair`              |

Names come from the camera list read when the connection was saved, and
refreshed automatically the next time the module reconnects to the master or
sees a camera it does not recognise — both WebSocket-driven, so they need
firmware v1.3.0 or newer just as the variables themselves do.

Requires master firmware **v1.3.0 or newer**. Against older firmware these
variables stay at their default values (`0` for the camera numbers, empty for
the names, `offair`).

## Presets

Presets ship pre-wired: every camera preset carries its **Camera is Live** or
**Camera is Preview** feedback, and the **ON AIR** / **OFF AIR** presets carry
the **On Air is On** feedback — **OFF AIR** inverted, so it lights while the
On Air light is _off_ rather than on. Dragging any of those onto a button shows
state immediately, with no feedback to add by hand.

Because it is inverted, **OFF AIR** also lights when the module has no
connection to the master at all — pre-v1.3.0 firmware, a blocked port, or a
master that has simply never answered — since with nothing to go on, "on air"
reads as false and inverting false lights the button. It reports "not on air",
which is what it knows. Pair it with **Master is Connected** if telling those
two apart matters to you.

**AUTO**, **ALL OFF** and **ALL IDLE** carry no feedback: they are momentary
commands with no state of their own to report.

## Picking a camera

Camera actions offer a dropdown listing your cameras by number and name, read from
the master when the connection was saved.

- **`— select a camera —`** is the default. A button you have dragged out but not
  yet configured does nothing and logs a warning, rather than switching a camera
  you did not choose.
- **`Manual entry…`** reveals a number field, for when the master was unreachable
  while you were building the button, or you simply prefer numbers.

**Camera names can go stale.** The list is read when you save the connection, and
refreshed automatically whenever the module reconnects to the master or the master
reports a camera number these dropdowns don't recognise yet. Both of those
triggers are WebSocket-driven and need firmware v1.3.0 or newer; against older
firmware, reopening the connection settings and saving — or restarting
Companion, or reloading the module — is what picks up a rename instead. Short
of one of those, a camera you rename in the master's web UI keeps its old name
here until one occurs. This is cosmetic only — the camera _number_ the action
sends is unchanged, so your buttons keep working either way.

## Two behaviours that come from the master, not this module

**`Set Live + Preview` turns everything off in two cases:** when both are set to
_None_, and when live and preview are set to the _same_ camera. That is the
master's firmware logic, deliberately not second-guessed here.

**A camera that is powered off or out of radio range will not change.** The master
replies with an error, which this module writes to the Companion log, but the
connection stays green because the master itself is fine. If a light does not
change when you press a button, check the Companion log and then the camera.

## Status indicator

| Colour                      | Meaning                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Green                       | Master answered                                                                                                           |
| Red — "unreachable"         | Nothing answered at that address                                                                                          |
| Red — "unexpected response" | Something answered but it is not an RM Tally Lights master; check the address                                             |
| Red — no message            | An action got no reply at all — a timeout, or the master going away mid-command; see "Don't lower the timeout much" above |

This dot is set once when the connection is saved and again after every
action's result — never on a timer — so a red dot clears as soon as the next
action gets any response at all, success or rejection, since either one proves
the master is there. It tracks the HTTP side only; see **Master is Connected**
under Feedbacks for the separate signal that tracks the WebSocket.
