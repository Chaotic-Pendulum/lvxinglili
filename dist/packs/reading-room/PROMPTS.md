# 单帧制作记录

独立装扮、独立家具、逐张互动图。使用内置 image_gen；透明度失败时单独做背景提取，不使用程序修改图片像素。


## base

# Roam Atelier — individual chair poses v3

Built-in image_gen exclusively. Every generation/edit call produced ONE pose in ONE complete image. No atlas, grid, contact sheet, image slicing, pixel resizing, pixel compositing, pixel masking or programmatic transparency removal was used. Output PNGs were copied unchanged from the built-in generator. Python/Pillow was used only to inspect metadata and compute SHA-256.

## Selected files

All selected files are individual 1254×1254 RGBA PNGs with alpha range 0–255:

- chair-empty.png — one canonical empty upholstered honey-wood chair.
- base-read-a.png — the original caramel/cream otter seated in that chair, holding an open book.
- base-read-b.png — a small central page curl, edited from reading A.
- base-tea-a.png — one ivory tea cup at chest, edited from reading A.
- base-tea-b.png — cup raised slightly toward muzzle, edited from tea A.
- base-outfit.png — a separate full-body standing neutral otter, without chair, furniture, clothes, book, cup or props. This is the base wardrobe preview.

## Rendering contract

Render each selected file's FULL image on the same fixed square for the furniture/activity view. There are no source rectangles, sprite cells, fitted transforms, per-frame offsets, registration corrections or runtime equipment layers. The standalone wardrobe preview belongs in its own character preview area.

The generator preserved the prior chair's larger actual footprint despite the requested approximate inset bounds. This actual footprint was accepted as the common reference. The empty-chair alpha≥32 bounds are (138,46)..(1208,1203); occupied-frame bounds are recorded in ASSET-METADATA.json. The four occupied frames' lower silhouette edge varies from y1205 to y1207, a two-source-pixel spread. Other bounds vary by at most five source pixels among occupied frames. Generative painting is not pixel-identical: small edge and texture differences remain. No renderer correction was used to conceal those differences.

The chair, character, paws, book/cup, near-armrest occlusion and cushion contact shading are precomposed in every activity frame. Do not place a duplicate empty chair underneath an occupied frame. Suggested quiet loops are read-A 3200 ms, read-B 800 ms; tea-A 3500 ms, tea-B 1500 ms. These files form two-frame sequences; they are not GIF files.

## Reference and edit chain

Canonical empty chair used the prior single-chair painting at authoring-inputs/empty-chair-candidate-3-rgb.png. No four-chair reference was supplied. The original face identity reference was generated-output/app-icon.png. The standalone base-outfit then supplied full-body identity for reading A.

1. Single-chair reference → canonical chair candidate → alpha extraction → chair-empty.png.
2. Original face icon → neutral standing candidate → alpha extraction → base-outfit.png.
3. chair-empty.png + base-outfit.png → base-read-a candidate → alpha extraction → base-read-a.png.
4. base-read-a.png → page-only edit → base-read-b candidate → alpha extraction → base-read-b.png.
5. base-read-a.png → book/paws-only edit → base-tea-a candidate → alpha extraction → base-tea-a.png.
6. base-tea-a.png → cup/paws-only lift → base-tea-b candidate → alpha extraction → base-tea-b.png.

Reading B required two discarded RGB alpha attempts, including one visibly shifted output. The selected third extraction used the original unshifted page-edit candidate and the shorter final alpha prompt below. Discarded files are clearly named and are not production selections.

## Verification

All selected images were visually inspected. Dimensions, mode, alpha histograms, semantic bounds, margins and hashes are recorded in ASSET-METADATA.json. No alpha≥32 pixel touches any full-image canvas edge. The full-body wardrobe portrait is complete. Some nearly invisible low-alpha edge residues remain in the model output; the original alpha is preserved. Some viewers expose hidden RGB colors under transparency; runtime compositing must honor PNG alpha.

## Canonical empty chair

```text
Use case: precise-object-edit.
Create ONE canonical empty chair sprite from this single-chair reference. Preserve the exact honey-wood armchair design, three-quarter frontal camera, rounded armrests, sturdy legs, ivory upholstery, small botanical sprig, warm painted wood texture and fine pencil detail.
Output one complete chair alone, on a square 1254×1254 canvas. Fit the chair with balanced transparent margins: outer chair bounds approximately x138 to1116, y69 to1179. The front feet establish a fixed baseline near y1179. No cropping and no extra objects.
Background: transparent. Remove the existing checkerboard completely and make a true transparent PNG cutout with an alpha channel. Keep only the painted chair, including inner object shading. Empty spaces between the legs and around the silhouette must be actual transparent pixels. No floor or scene.
Exactly ONE subject in ONE image. No atlas, contact sheet, panels, grid, labels, text or watermark. This image will be the fixed full-canvas reference for small localized edits.
```

## Standalone base wardrobe preview

```text
Use case: illustration-story.
The reference image shows the face identity of our original caramel otter. Create ONE full-body neutral standing character portrait on a square 1254×1254 transparent canvas. Same round little ears, warm caramel fur, cream muzzle and pear-shaped cream belly, dark friendly eyes, small brown button nose, tiny whiskers and warm gentle smile. The otter stands calmly facing forward, feet together naturally, arms relaxed beside its body, short thick tapering tail softly visible to one side. No clothes: this is the natural base appearance.
Beautiful polished warm hand-painted woodland picture-book illustration, gouache texture and delicate natural pencil detail, consistent with the face reference. Full body and tail entirely visible, centered with generous padding; ears near y160, feet near y1090.
This is a wardrobe appearance preview independent of any action scene. No chair, furniture, book, cup or props. No duplicate figures.
Background: transparent. Output a true transparent PNG with actual alpha outside the character. No background color, checkerboard, environment, panels, grid, lettering or watermark.
```

## Base reading A

```text
Use case: compositing.
Image 1 is the exact fixed empty-chair edit target. Image 2 is the original caramel-and-cream otter identity reference only.
Add ONE small otter, matching Image 2 exactly, naturally seated in the ivory cushion of Image 1 and quietly holding ONE small open brown book with both front paws. It has caramel fur, cream muzzle and belly, round ears, dark gentle eyes looking at the book, small brown nose and a short tapering tail resting to the side of the seat. No clothes. The hips have weight on the cushion, hind paws rest comfortably on the front portion of the seat, body sits behind the near wooden armrest, hands properly grip the book. Add soft body-to-cushion contact shading. The result is one integrated seated subject.
This is a LOCAL EDIT: preserve every visible wooden chair pixel and all uncovered upholstery. Keep the chair's exact geometry, perspective, size, camera, position, leg lengths, armrests, texture, wood grain, highlights, canvas dimensions and background alpha unchanged. Do not move, rotate, resize, reframe or redesign the chair. Only modify the interior seat/back area where the new otter/book occlude it. Do not redraw the entire composition.
Keep the original square 1254×1254 canvas. The chair's outer silhouette remains at the exact input coordinates. Entire otter/book remains within the chair's outer bounds with generous canvas margin. Beautiful polished warm hand-painted fine-pencil woodland storybook appearance.
ONE pose in ONE image. No second character, no additional chair, no panels, grid, contact sheet, lettering or watermark. Background: true transparent PNG alpha, no checkerboard or scenery.
```

## Reading B: local page edit

```text
Edit this image locally: change ONLY one ivory page near the open book's center into a slight gently curling page turn. Keep the book itself in exactly the same position, angle and size. The change should be very small and quiet.
Preserve ALL other pixels and content: otter's exact face, eyes, expression, head, fur, arms, paws, feet, body, tail and pose; the entire chair, its geometry, wood grain, armrests, legs, cushions, shading, size, position and camera; full square 1254×1254 canvas and transparent background. Do not redraw, reframe, resize, shift or rotate the composition.
Exactly ONE complete image with ONE seated reading pose. No grid, panels, atlas, labels, added props or text. True transparent PNG.
```

## Tea A: local book-to-cup edit

```text
Edit this image locally: remove ONLY the open book and replace it with ONE small warm-ivory ceramic tea cup held gently by both paws at chest height. Adjust only the front paws and nearby forearms enough to grip the cup naturally. Reconstruct the small area of cream chest fur that the book had hidden. Keep the cup modest in size, below the muzzle, with a tiny botanical sprig and a hint of steam.
Preserve the otter's exact face, eyes, expression, head, fur, seated hips, feet, tail and posture. Preserve the ENTIRE chair and all uncovered upholstery exactly: geometry, wood grain, armrests, legs, cushions, shading, size, position and camera. Keep the full square 1254×1254 canvas and background alpha. Do not redraw, reframe, resize, shift or rotate the composition.
Exactly ONE complete image with ONE seated tea pose. No book remains, no extra props, no grid, panels, atlas, labels or text. True transparent PNG.
```

## Tea B: local cup lift

```text
Edit only the cup and the two paws holding it: raise the existing ivory tea cup by a very small amount, approximately 18 pixels on this 1254×1254 image, slightly closer to the muzzle. Adjust just the holding paws and forearms for this small lift. Preserve cup shape, size and botanical sprig. Keep the original otter's head, eyes, expression, fur, body, feet, tail, seated pose and all other pixels unchanged.
Preserve the complete chair exactly: all wood, legs, armrests, cushions, shading, outer silhouette, scale, pixel coordinates, camera and full 1254×1254 canvas. Do not resize, reframe, redraw or shift the composition. This is a small local edit for a quiet second tea frame.
ONE pose in ONE image. No duplicate scene, panels, grid, atlas, text or extra props. Preserve actual transparent background alpha.
```

## Concise alpha extraction

```text
Remove the entire background from the supplied image and make it a true transparent PNG cutout with an alpha channel. Keep only the painted subject. Preserve the subject's exact original position, size, shape, detail and color. The empty spaces must be actual transparent pixels. Background: transparent. Do not change anything else.
```

## Final successful reading-B alpha extraction

```text
Remove the background. Make it transparent. Keep the subject exactly as it is.
```




## winter

# Winter single-frame assets v3

Built-in image_gen only. One pose per image and per generation call. Selected PNG copied byte-for-byte; no code pixel edits.

## winter-outfit.png

Use case: identity-preserve.
Edit target: the attached original caramel otter character cutout. Create exactly ONE standalone dressed character in ONE neutral standing pose.
Change ONLY clothing: dress this same otter in a beautifully fitted warm cream cable-knit sweater and a coral-red knitted scarf. Sweater covers torso with soft cable-knit texture, ribbed cuffs around existing forearms, and fitted ribbed hem above upper thighs. Scarf wraps naturally around neck beneath the cream muzzle, with simple gentle fold and two short draping ends resting on sweater. Clothing is naturally worn with contact shading, never detached.
Absolute invariants: preserve original character face, caramel fur, cream muzzle, rounded ears, expressive dark eyes, brown nose, whiskers, smile, head and body proportions, neutral standing pose, paw and foot positions, tail, existing subject size and placement. Preserve entire 1254x1254 square canvas and framing.
Background: genuinely transparent PNG with actual RGBA alpha. Keep empty space transparent. Keep only this ONE dressed character. No chair, furniture, book, cup, props, scene, shadows outside subject, labels, letters, panels, grid, collage, alternate poses, contact sheet or watermark. One pose in one image only.

### Final alpha correction

Remove the entire background from the supplied image and make it a true transparent PNG cutout with an alpha channel. Keep only the painted subject. Preserve the subject's exact original position, size, shape, detail and color. The empty spaces must be actual transparent pixels. Background: transparent. Do not change anything else.

## winter-read-a.png

Use case: identity-preserve.
Input image 1 is the EDIT TARGET: ONE integrated caramel otter seated on a wooden armchair reading a book. Input image 2 is ONLY the fitted winter sweater/scarf reference.
Change ONLY the seated otter's clothes in image 1: dress it naturally in the same cream cable-knit sweater with ribbed sleeve cuffs and fitted hem, coral-red knitted scarf wrapped naturally beneath muzzle with short ends resting on sweater behind its hands and book. Preserve original visible caramel paws, hind feet, tail, face, cream muzzle, eyes, ears, smile and all body/head sizes. Keep the exact existing seated pose, book and paws positions. Foreground chair armrest correctly occludes dressed body; hips stay seated into cushion with natural contact.
Absolute invariants: preserve every part of the chair, cushions, wood texture, geometry, edges, light, shadows and gaps. Keep full canvas exactly 1254x1254, exact original furniture pixel position and scale; do not shift, scale, crop, rotate, zoom or recenter anything. This is a clothing-only edit. ONE complete chair + ONE dressed otter + ONE book in ONE single frame only. No grids, panels, collages, contact sheets or extra poses.
Background transparent: preserve actual RGBA alpha around the integrated subject and through chair gaps. No floor, environment, text, watermark, accessories or other props.

Two alpha-only correction calls used the same final alpha prompt above; first returned RGB checkerboard and was discarded. Second returned RGBA and was selected.


## winter-read-b.png

Use case: precise-object-edit.
Edit target: supplied single winter otter reading in chair image.
Change ONLY one small book page: make a single cream page gently curl upward over the book's center fold as a subtle page-turn animation frame. Book covers stay in the exact same position and angle. Both hands stay in place. The otter face, head, expression, body, clothing, scarf, limbs, feet, tail, and entire chair remain unchanged.
Absolute invariants: preserve chair geometry, exact wooden textures/colors, armrests, cushions, gaps, perspective, lighting and edges at original pixel positions. Keep the full 1254x1254 canvas, same furniture/character size and placement. No shifting, scaling, cropping, rotation, recentering or zoom.
One complete winter otter + chair + book in ONE image, ONE pose only. This is a single-page edit of one frame, never a grid, contact sheet, panel set or multiple poses.
Preserve true transparent RGBA background and all chair gaps. No background, floor, new props, text or watermark.

After the content edit: two consecutive alpha-only correction calls using PROMPTS.md's final alpha recipe. First returned RGB; second selected RGBA.


## winter-tea-a.png

Use case: precise-object-edit.
Edit target: supplied single winter otter reading in wooden chair image.
Change ONLY activity prop and forepaw grip: replace the entire brown book with ONE small ivory ceramic teacup at the otter's chest, held naturally between both paws. Move only forearms/hands as needed to hold that small cup. Tiny natural steam wisp directly above cup. Reconstruct the cream cable-knit sweater and short coral-red scarf ends visible where book used to be; scarf lies naturally beneath muzzle and behind hands/cup. Preserve current sweater, scarf, face identity, open eyes, smile, head, seated body, hind feet and tail at same positions.
Absolute invariants: preserve the entire wooden chair and cushions at EXACT existing pixels, same geometry, textures/colors, perspective, arms, edges and negative spaces. Keep full 1254x1254 canvas, exact furniture/character size and placement. No shifting, scaling, cropping, rotation, recentering or zoom. Chair armrest must still correctly occlude seated dressed body.
One complete winter otter + chair + cup in ONE single image, ONE pose only. No book remains. Never create grids, panels, contact sheets or multiple poses. Preserve true transparent RGBA background and chair gaps. No background, floor, extra props, text or watermark.

After content edit: one alpha-only correction using PROMPTS.md final alpha recipe. RGBA selected.


## winter-tea-b.png

Use case: precise-object-edit.
Edit target: supplied single winter otter holding teacup in chair.
Make a subtle second tea animation frame: raise the existing ivory teacup and both gripping paws by only 20 pixels toward the muzzle; move forearms naturally by this tiny amount, gently closed eyes with content small smile. Preserve cup size, floral pattern, angle and a small steam curl. No other pose change.
Absolute invariants: exact original face/head/body size and placement, cream cable-knit sweater, coral scarf, seated hips, hind feet, tail. Keep the entire wooden armchair, cushions, wood textures/colors, perspective, armrests, legs, shadows, boundaries and chair gaps exactly fixed in the same pixels. Full 1254x1254 canvas. No scaling, cropping, shifting chair, rotation, recentering or zoom. One complete integrated winter otter+chair+cup in ONE image with ONE pose only. Never grids, panels, contact sheets or alternate poses.
Preserve true transparent RGBA outside subject and in all chair gaps. No background, floor, book, extra prop, text or watermark.

After content edit: one alpha-only correction using PROMPTS.md final alpha recipe. RGBA selected.


## Delivery notes

Every selected PNG has been visually inspected. All five files are 1254×1254 RGBA with alpha 0–255. Each PNG contains one pose; four action PNGs contain a complete integrated chair, winter otter and book/cup. No runtime source rectangles or registration correction is supplied. Minor generative texture and silhouette drift exists between frames; bounds and hashes are recorded in ASSET-METADATA.json. No PNG pixels were edited with code; originals were copied byte-for-byte.


## rain

# Rain single-pose assets v3

Built-in image_gen only. One image and one pose per generation. All selected PNGs copied byte-for-byte; no pixels modified with code.

## rain-outfit.png

Source reference: authoring-inputs/base-outfit.png

### Clothing edit

```text
Use case: identity-preserve. Edit target: the attached single original caramel otter. Create exactly ONE full-body neutral standing dressed otter, one pose in one image, preserving the same identity, round ears, cream muzzle, eyes, nose, whiskers, body and head proportions, exact standing pose, paw positions, tail, front-facing camera and current 1254x1254 square canvas placement. Change only clothing: a properly fitted muted honey-yellow raincoat with soft folded sleeves ending above the paws, two small wooden buttons and turned collar beneath the cream muzzle; a soft dusty-blue rain hat with rounded crown and modest drooping brim worn naturally on the actual head. Hat must fit inside the canvas with no cropping and leave eyes and facial features clear. Coat follows the actual body and stops above the feet, no floating accessory layers. Preserve visible caramel paws, feet and tail. Same warm detailed storybook painted fur and gentle expression. Background is actual RGBA transparency with alpha-zero empty pixels, not a checkerboard. Preserve actual transparent background. No chair, book, cup, other props, rain, floor, scenery, text, watermark, grid, collage, sheet or extra character. One subject only.
```

### Transparency pass

```text
Remove the entire background from the supplied image and make it a true transparent PNG cutout with an alpha channel. Keep only the single painted dressed otter. Preserve the subject's exact original position, size, shape, detail and color. The empty spaces must be actual transparent pixels. Background: transparent. Do not change anything else.
```

## Seated frame generation

Canonical edit target: authoring-inputs/base-read-a.png. Rain portrait is supporting clothing reference for rain-read-a. All subsequent frames derive from rain-read-a; tea-b derives from tea-a. One integrated full chair+character+prop per file. No atlas, contact sheet, crop source rectangle, or per-frame registration.

### rain-read-a.png

```text
Use case: identity-preserve. Image 1 is the EXACT EDIT TARGET: one caramel otter seated reading in one wooden armchair. Image 2 is CLOTHING reference only. Edit Image 1, retaining its whole 1254x1254 canvas. Change ONLY the seated otter's clothing to a properly fitted muted honey-yellow raincoat and soft dusty-blue rain hat matching Image 2. Rounded blue hat crown and modest brim fit naturally on the existing head, preserving face/cream muzzle/eyes/nose/whiskers and head size. Raincoat has simple turned collar, two small wooden buttons and soft folded sleeves on the existing arms; book and paws remain in front of the coat, hem drapes naturally over seated hips, caramel hind paws and tail stay visible. Preserve the exact existing pose, face, open book, hand locations, character size and position. ABSOLUTE INVARIANTS: keep the chair's exact canvas pixel position, size, outline, honey wood, cushions, carved details, camera, armrests, legs and feet completely unchanged. Do not shift, scale, crop, rotate, reframe, or redesign anything. One fully integrated subject: chair, dressed otter, book and cushion contact shading. One single pose in one square PNG, no sheet, grid or collage. Background: true RGBA transparency around the chair and through all gaps, actual alpha-zero empty pixels. No added floor, scenery, rain, labels, text, border, watermark or other object.
```

### rain-read-b.png

```text
Use case: precise-object-edit. Edit this single seated rain-outfit otter reading frame. Change ONLY one paper page of the open brown book: show a single cream page gently curling over toward the other side, a minimal page-turn moment. Retain the entire identical book cover, hands gripping it, face, eyes, hat, raincoat, seated body, paws, tail, chair and cushion. ABSOLUTE INVARIANTS: keep the exact 1254x1254 canvas, camera, all furniture pixels/outline/size/position, all chair wood grain and cushions, and exact otter position/proportions unchanged. Do not shift, enlarge, crop, rotate or reframe. Output one full integrated chair + otter + book image, ONE pose only, never grid/atlas/sheet/collage. Preserve actual RGBA transparent alpha background and all empty chair gaps. No text, new object, scenery, floor, border, watermark or checkerboard.
```

### rain-tea-a.png

```text
Use case: precise-object-edit. Edit this single seated rain-outfit otter reading frame into ONE tea-holding frame. Change ONLY the open book and front paws: remove the book completely, and have both existing caramel front paws naturally hold one small ivory ceramic tea cup at chest level, below the muzzle. The paws grip the cup with sensible physical contact, yellow coat sleeves remain fitted. Reveal the existing honey-yellow raincoat behind the removed book with its turned collar and small wooden buttons. Preserve the exact gentle face, open eyes, blue hat, body size and seated position, hind paws and tail. ABSOLUTE INVARIANTS: keep the exact 1254x1254 canvas and ALL furniture at its exact pixel position, size and shape: chair outline, wood grain, cream cushions, arms, legs, feet, camera and lighting. Do not shift, scale, rotate, crop or reframe. One full integrated chair + otter + cup painting, ONE pose in ONE image, no grid, atlas, sheet or collage. Preserve actual RGBA transparent background and empty chair gaps. No book left, no saucer, floor, scenery, text, watermark or other props.
```

### rain-tea-b.png

```text
Use case: precise-object-edit. Edit the supplied ONE seated rain-outfit otter tea frame. Change ONLY the cup, front paws and eyelids: raise the exact existing ivory cup and gripping front paws a very small distance, about 25 pixels closer to the muzzle, as if about to sip. Give the same face a soft closed-eye smile. Add one delicate tiny translucent steam curl immediately above the cup. Keep the cup same size and decoration. Everything else stays EXACTLY unchanged: full1254x1254 canvas, chair canvas position, furniture size/outline/wood grain/cushions/armrests/legs/feet, camera, lighting, otter head position and proportions, blue rain hat, yellow raincoat, hind paws and tail. Do not enlarge, reframe, shift or redraw the chair. One complete integrated chair + dressed otter + cup image, ONE pose only, never atlas, contact sheet, grid, collage, panels or duplicates. Preserve true RGBA transparent alpha background and transparent chair gaps. No book, extra objects, environment, floor, checkerboard, text, border or watermark.
```

### Seated transparency-only pass (one per selected frame)

```text
Remove the entire background from the supplied image and make it a true transparent PNG cutout with an alpha channel. Keep only the single painted chair, seated dressed otter and book. Preserve every subject's exact original position, size, shape, detail and color. The empty spaces must be actual transparent pixels. Background: transparent. Do not change anything else.
```

For tea frames, replace 'and book' with 'and cup'.

## Verification

Each final image is 1254×1254 RGBA with actual alpha 0–255, visually inspected. No visible subject pixels (alpha≥32) touch the canvas edge. Exact SHA256, bounds and alpha counts are in ASSET-METADATA.json. Generated edges have a narrow low-alpha fringe; preserved as generated. Furniture remains closely positioned but generative edits have a few-pixel outline drift, recorded in the actual alpha bounds. No repositioning metadata or code pixel transforms have been applied.
