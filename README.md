# Full Speed Ahead

Vehicle movement helpers for Foundry VTT.

Full Speed Ahead rotates vehicle tokens toward their movement destination, can sequence rotation before movement, plays movement sound effects, adds configurable thruster trails, and includes a targeting helper for ship combat.

## Features

- Automatically rotates actor tokens with type `vehicle`.
- Smooth shortest-path rotation during the first few grid spaces of movement.
- Configurable rotation update interval, finish distance, and rotation offset for different ship art orientations.
- Movement sound effect with configurable path and volume.
- Token-attached PIXI thruster cone rendered underneath the token with configurable color, length, and width.
- Movement effects settings menu with an audio browse button and thruster color picker.
- Token-control targeting button for GMs and players.

## Install

Use the manifest URL from the latest release:

```text
https://github.com/edgedoggo/full-speed-ahead/releases/latest/download/module.json
```

## Notes

The Foundry module id remains `full-speed-ahead` because module ids should stay lowercase and URL-safe. The visible module title is **Full Speed Ahead**.
