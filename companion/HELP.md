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

When you save the connection the module makes exactly two requests: one to check
the master is reachable, and one to read your camera list so actions can show real
camera names. **Nothing is polled.** The master runs a single-threaded web server
that becomes unresponsive under sustained connection pressure, so this module only
talks to it when you press a button.

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

## Picking a camera

Camera actions offer a dropdown listing your cameras by number and name, read from
the master when the connection was saved.

- **`— select a camera —`** is the default. A button you have dragged out but not
  yet configured does nothing and logs a warning, rather than switching a camera
  you did not choose.
- **`Manual entry…`** reveals a number field, for when the master was unreachable
  while you were building the button, or you simply prefer numbers.

**Camera names can go stale.** The list is read when you save the connection, so a
camera you rename in the master's web UI keeps its old name in these dropdowns
until you open the connection settings and save again. This is cosmetic only — the
camera _number_ the action sends is unchanged, so your buttons keep working.

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
