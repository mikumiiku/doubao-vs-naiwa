---
version: alpha
name: "豆包大战奶蛙"
description: "A playful Chinese garden defense game with painted wheat-and-leaf UI."
colors:
  primary: "#ffd54a"
  text: "#5b2d12"
  parchment: "#fdf3d8"
typography:
  sans:
    fontFamily: 'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
rounded:
  selection: "12px"
spacing:
  mode-pitch: "160px"
components:
  artwork:
    textColor: "{colors.text}"
    backgroundColor: "{colors.parchment}"
  mode-button: {}
  pause-panel: {}
---

# 豆包大战奶蛙 Design System

## Overview

### Creative North Star

Carved garden signboards with golden dough, green leaves, and wheat. Characters and scenery retain their existing rendered cartoon identity.

### Product context and register

Chinese casual tower defense played in a full-window canvas. Home opens mode selection; adventure resumes saved progress. A saved battle is labeled 继续战斗 and opens paused until Continue is pressed. Puzzle, minigame and survival remain future modes. The pause menu controls volume, continuation and return to modes. Product evidence: README.md, src/main.ts, src/game/config.ts and src/game/systems.ts.

The distinctive signature is the painted Chinese title lettering. Dense gameplay keeps large decorative titles out of the playing area. No marketing cards or unrelated illustrations.

Runtime ownership: frontmatter mirrors the existing canvas palette in src/game/ui.ts and src/game/modeselect.ts. Raster sources in assets/ui own the illustrated surfaces; scripts/assets/prepare-ui.mjs extracts their runtime textures. src/core/uiart.ts owns proportional rendering. This file documents existing tokens and does not generate CSS.

## Colors

Gold marks the active action and selection. Brown gives lettering and outlines contrast against cream parchment. Future modes reduce artwork opacity and retain the visible 敬请期待 status. Scene dimming belongs to the canvas overlay.

## Typography

Titles and primary control labels live in generated textures. Dynamic progress and hints use the Chinese-capable sans stack above. Text is simplified Chinese. Volume uses a label above the slider and no numeric percentage.

## Layout

The design coordinate system is 1585 by 992. src/main.ts uniformly scales it to the viewport and centers it with letterboxing. index.html owns document overflow. Four mode buttons share one vertical geometry. Pause drawing and hit testing share the rectangles exported from src/game/ui.ts.

## Elevation & Depth

Painted bevels and wood borders give depth. Modal dimming separates paused play; no backdrop scenery is embedded in individual controls. Texture alpha remains intact throughout the build.

## Shapes

Illustrated signboards have organic leaves and wood corners. Selection outlines use the existing 12px round rectangle. Art keeps its natural proportions when placed within a hit rectangle.

## Components

Card hover shows a two-line cream tooltip: the unit name and a short effect. Regular cards and conveyor cards share drawUnitTooltip in src/game/ui.ts. Adventure has ten levels, adding one defender per level and an enemy on odd-numbered levels. The /debug route opens a plain native ten-level picker after Adventure; every level starts fresh and debug battles leave saved progress untouched. Ordinary frogs form the opening waves; laugh infection displays a purple progress ring. Candy shields hold general front lines and drop supplies when damaged. Golden yellow eggs roll continuously, vault over their first defender and hatch into milk chickens after landing; defeat leaves yellow shell fragments. The rally frog uses skates, a red headband and a megaphone with a visible cheering phrase and short aura.

Buttons brighten on hover and the home action contracts while pressed. Unavailable modes show a status hint when clicked. The clip frame holds the existing tool image and keeps its gold selected outline. Pause uses separate panel, title, action, volume-label, track, fill and knob textures. Track geometry maps exactly to volume 0 through 1. Esc resumes play using the existing cancellation path.

Titles float subtly; sprites follow their baked motion tracks. Animation is not used to encode button availability. Failures retain the existing loading-error view. All art names and load paths are owned by src/core/uiart.ts and src/core/assets.ts.

Battle defeat uses a separate transparent chewing sprite loop and the painted 奶蛙嚼嚼嚼 title. Its gold 重新开始 and wood 返回选关 buttons share loseButtonsRect between drawing and hit testing. The battle stays frozen behind the dim overlay while the chewing animation continues; failure audio plays once when the state changes. Loading errors retain their existing error view.

Level 5 is a 180-second egg rhythm challenge with 649 fixed notes. Both the input and egg center must be inside the third lawn column, marked by a gold outline. A shrinking approach circle and sequence number make the small center target readable; hit radius is 34 design pixels, the timing window is ±90ms and precise hits require ±35ms. The final section has five hits per second and misses break combo; the fifth miss loses. src/game/eggrhythm.ts owns the chart and timing constants. A cream score panel and a countdown show performance and the current section, never rules. Mouse clicks and non-repeating Z/X presses share hitInvasionEgg. Rules appear in a four-page Doubao visual novel opening, with greeting, teaching and winking portraits. src/game/eggstory.ts owns the dialogue and src/game/eggdialogue.ts owns native modal buttons, focus and responsive layout. Dialogue freezes play, preserves its page in saves, and can be replayed. Esc opens the shared pause menu without losing the current line. Portrait source alpha lives in assets/dialogue; prepare-ui.mjs creates runtime files. eggdialogue.css owns dialogue tokens, mirroring primary/text/parchment above and using scarf red #a82e25 for the speaker tab and focus. Level 10 delivers free physical cards on a moving wooden conveyor; occupied tiles retain the selected card, a full belt retains supplies, and production grants extra deliveries. src/game/special.ts owns their mechanics and HUD. The ordinary dough/card HUD is hidden in both special types. Special pause, defeat and reward flows retain the shared illustrated components.

Early battles progressively open one, three, four and then five rows. A cream caption above the lawn explains the current encounter, without covering plantable cells. New defender artwork keeps the existing brown bob, large eyes and rounded rendered cartoon proportions, with distinct candy, needle, heart, audio, fish, letter and door silhouettes. Raster sources and atlas layouts live in assets/characters/catalog.json.

Version 2 battle saves include egg-invasion and conveyor state. Older battle saves restart their corresponding level paused while keeping unlocked progress; old garlic cards migrate to candy shields.
Egg rule revision 2 preserves chart position, scores, combo and judgement state; saves from the old short minigame restart the new chart paused, keeping formal campaign progress.

## Do's and Don'ts

- Preserve Chinese wording and existing mode availability.
- Share rectangles between control rendering and hit testing.
- Preserve alpha and aspect ratios of generated textures.
- Keep source textures in the repository so runtime art can be regenerated.
