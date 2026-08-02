# RM Tally Lights

Control an **RM Tally Lights** system from Companion — camera tally states and the
On Air light — without hand-typing HTTP URLs into Generic HTTP actions.

RM Tally Lights is an ESP32-based tally system: a master node hosts a web UI and
relays state over ESP-NOW to camera tally lights (LED matrices) and to an On Air
light (a relay). This module talks to the master's HTTP API.

## Configuration

| Field               | Notes                                                              |
| ------------------- | ------------------------------------------------------------------ |
| **Master address**  | IP or hostname of the master, e.g. `192.168.0.76` or `tally.local` |
| **Port**            | `80` unless you have changed it                                    |
| **Request timeout** | `10000` ms by default — see the note below before lowering it      |

When you save the connection the module reads your camera list over HTTP so
actions and feedbacks can show real camera names, then opens a single
WebSocket to the master. The master pushes a complete state snapshot when the
socket opens and again whenever anything changes, so **nothing is polled** —
one connection replaces what would otherwise be a request every couple of
seconds.

If the socket cannot be opened — an older master, a blocked port, a reboot in
progress — every action still works exactly as before. Feedbacks and variables
simply stay inactive, and the **Master is Connected** feedback reports it.

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

**Master is Connected** follows the connection only — it does not go red because
a single command was rejected. A failed command means one request failed; a
dropped connection means the master is gone, and during a show those need
different reactions.

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

Names come from the camera list read when the connection was saved. If you
rename a camera on the master, the new name appears the next time the module
reconnects or sees a camera it does not recognise.

Requires master firmware **v1.3.0 or newer**, same as the feedbacks above.
Against older firmware these variables stay at their default values.

## Presets

Presets ship pre-wired: every camera preset carries its **Camera is Live** or
**Camera is Preview** feedback, and the **ON AIR** / **OFF AIR** presets carry
the **On Air is On** feedback, so a preset dragged straight onto a button shows
state immediately, without adding a feedback by hand.

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
reports a camera number these dropdowns don't recognise yet. Short of one of
those, a camera you rename in the master's web UI keeps its old name here until
one occurs. This is cosmetic only — the camera _number_ the action sends is
unchanged, so your buttons keep working either way.

## Two behaviours that come from the master, not this module

**`Set Live + Preview` turns everything off in two cases:** when both are set to
_None_, and when live and preview are set to the _same_ camera. That is the
master's firmware logic, deliberately not second-guessed here.

**A camera that is powered off or out of radio range will not change.** The master
replies with an error, which this module writes to the Companion log, but the
connection stays green because the master itself is fine. If a light does not
change when you press a button, check the Companion log and then the camera.

## Status indicator

| Colour                      | Meaning                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| Green                       | Master answered                                                               |
| Red — "unreachable"         | Nothing answered at that address                                              |
| Red — "unexpected response" | Something answered but it is not an RM Tally Lights master; check the address |

Because nothing is polled, a red connection clears as soon as any button press
succeeds.
