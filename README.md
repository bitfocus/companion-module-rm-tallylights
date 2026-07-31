# companion-module-rm-tallylights

A [Bitfocus Companion](https://bitfocus.io/companion) module for **RM Tally Lights**,
an ESP32-based camera tally and On Air light system by Rosnell Media Group.

Exposes the tally master's HTTP API as named Companion actions, so operators build
buttons from a dropdown instead of hand-typing URLs into Generic HTTP.

See [HELP.md](./companion/HELP.md) for user documentation and [LICENSE](./LICENSE).

## What it does

Ten actions covering camera tally states (live / preview / idle / off, individually
or all at once), the master's `Auto` swap, its combined live+preview endpoint, and
the On Air relay. Plus ready-to-drag presets, including one pair per camera.

**Nothing is polled.** The module makes two HTTP requests when a connection is
configured and one per button press. The master runs a single-threaded web server
that becomes unresponsive under sustained connection pressure, so background
polling is deliberately absent — which is also why v1 has no feedbacks. See
`docs/superpowers/specs/` for the design rationale.

### Known limitation: camera names can go stale

The camera list is read from the master when the connection is saved. A camera
renamed in the master's web UI keeps its old name in action dropdowns until you
re-save the connection. This is cosmetic — the camera _number_ the action sends is
unchanged, so buttons keep working correctly.

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
