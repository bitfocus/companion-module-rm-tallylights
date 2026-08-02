# companion-module-rm-tallylights

A [Bitfocus Companion](https://bitfocus.io/companion) module for **RM Tally Lights**,
an ESP32-based camera tally and On Air light system by Rosnell Media Group.

Exposes the tally master's HTTP API as named Companion actions, so operators build
buttons from a dropdown instead of hand-typing URLs into Generic HTTP.

See [HELP.md](./companion/HELP.md) for user documentation and [LICENSE](./LICENSE).

## What it does

Ten actions covering camera tally states (live / preview / idle / off, individually
or all at once), the master's `Auto` swap, its combined live+preview endpoint, and
the On Air relay. Four feedbacks (per-camera live, per-camera preview, On Air, and
whether the module's state connection to the master is open) and five variables
(live/preview camera number and name, On Air state) report the master's state back
into Companion. Presets are ready to drag out, including one pair per camera, and
most ship with their feedback already attached.

**Nothing is polled.** Saving the connection reads the camera list over HTTP, and
each button press is one HTTP request. Against master firmware **v1.3.0 or
newer**, the module also opens a single WebSocket that the master pushes a
complete state snapshot over on connect and again on every change — that push
channel is what drives the feedbacks and variables above. Against older firmware
every action still works; the feedbacks and variables simply stay inactive. See
`docs/superpowers/specs/` for the design rationale, and
[HELP.md](./companion/HELP.md) for full user-facing behaviour, including camera
name refresh timing and what happens during a master reboot or a dropped
connection.

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

## Tests

```
yarn test
```

The HTTP, camera-list, and camera-picker layers are deliberately free of any
Companion dependency so they can be unit tested in isolation. The action and
preset definitions are tested through a stub instance, which pins the cross-file
contracts — option ids, action ids, and the action ids referenced by presets.

## Packaging

```
yarn package
```

Produces `pkg/` and a `.tgz` that can be loaded directly from Companion's Modules
page, without waiting on a registry submission.
