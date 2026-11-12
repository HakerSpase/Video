# PS1 collection — промпты для Omni (image-to-video)

Исходники: `src/1-serafim.png`, `src/2-gotika.png`, `src/3-sirena.png`, `src/4-padshiy.png`.
Промпты на английском: видеомодели понимают его точнее. Комментарии на русском.

## Формат: не просить у Omni сразу 9:16

У фото разный формат: 1 и 4 квадратные, 3 вертикальное 3:4, 2 горизонтальное (~16:10).
Если попросить 9:16, Omni **дорисует недостающее**. На фото 2 принт обрезан снизу, и модель
придумает его нижнюю половину. Это уже другой товар.

**Генерируем в родном формате фото** (1:1, 3:4, 16:9). На 9:16 кадрирую при монтаже:
- 1 и 4 (чёрный фон): кроп по центру + чёрные/размытые поля сверху и снизу под текст;
- 3 (3:4): почти без потерь, только поля;
- 2: вертикальный кроп по лицу и принту (ширина ~550 px из 1617), монитор частично уйдёт.

## Общие настройки

- Длительность **5 с**. Сила движения низкая или средняя (3–4 из 10).
- Если можно задать **последний кадр**, ставьте **то же фото**: принт вернётся к оригиналу.
- 3–4 генерации на фото, выбирать по принту на паузе.
- Слоу-мо доделаю при монтаже (интерполяция + замедление ×2).

### Блок «защита принта» — в конец КАЖДОГО промпта
```
The black t-shirt and its printed graphic are the product: keep the print exactly as
in the reference image — same drawing, same colors, same proportions, same pixel
edges, flat on the chest and fully visible. No morphing, no warping, no redrawing,
no added or removed details. Fabric stays smooth across the print, no folds over
the graphic. Hands, hair and the hoodie never cover the print. Do not extend or
invent any part of the print outside the original frame.
```

### Negative prompt
```
distorted print, warped graphic, morphing t-shirt design, changed print, blurry print,
melting pixels, extra limbs, deformed hands, extra fingers, face morphing, identity change,
changed piercings, text artifacts, watermark, fabric wrinkles over chest, fast motion,
shaky camera, smoke
```

---

## 1 — «Серафим в бинтах» (`src/1-serafim.png`, 1:1)
Чёрные волосы с чёлкой (шэгги-каре), пирсинг (септум, губа, серьги), кончик языка между зубами,
худи спущено с плеч, вспышка, чёрный фон. Принт яркий, голубой, читается лучше всех:
**это главный кадр ролика**, ставим первым.

```
High-fashion flash editorial video, slow motion, 120fps look. Pale girl with a black
shaggy bob and blunt bangs, septum and lip piercings, long silver earrings, black
zip hoodie slipped off her shoulders, fitted black t-shirt with a pale-blue pixel-art
angel print with spread wings. Harsh on-camera flash, pure black background.
The camera slowly pushes in from slightly above and drifts about 10 degrees to the
right, ending on a medium close-up from the head to the waist. She slowly
straightens up, tilts her head and keeps eye contact with the lens, earrings
sway softly, a few strands of hair move in a light breeze. The hoodie stays slipped
off the shoulders and does not move over the chest. One soft strobe flash pulse
at the start. Crisp, high contrast, cold tones, subtle film grain.
```
+ блок «защита принта».

---

## 2 — «Готика ракурс сверху» (`src/2-gotika.png`, горизонтальное)
Длинные тёмные волосы, большие очки с бликом экрана, крестик, худи на молнии, зеленоватая
стена, монитор справа. Принт обрезан снизу кадра: видны голова, плечи и чокер с сердцем.

Главное правило: **камера НЕ опускается вниз**, иначе Omni дорисует остаток принта.
Движение только по глубине и вбок.

```
Moody late-90s lo-fi video, slow motion, low-angle selfie perspective. Girl with very
long dark hair, bangs and big black glasses reflecting a screen, silver cross
necklace, open black zip hoodie, black t-shirt with a pixel-art gothic girl print
visible at the bottom of the frame. Dim room, greenish wall, a wall-mounted monitor
glowing on the right. The camera stays at the same low angle and very slowly pushes
in toward her face and the print, with a tiny drift to the left. No tilt down, the
framing at the bottom stays the same. She slowly tilts her head, lowers her chin and
looks down into the lens; the reflection in her glasses flickers with the monitor
light, strands of hair move slightly. Cool green-cyan glow, soft film grain, PS1
cutscene mood. The visible part of the print stays evenly lit and sharp.
```
+ блок «защита принта».

Риск: молния худи сползает на принт. Если так, добавьте: `the hoodie zipper edges stay still at the sides of the print`.

---

## 3 — «Кибер-сирена в очках» (`src/3-sirena.png`, 3:4)
Объёмные кудри (каштаново-рыжие), веснушки, тёмные губы, руки за спиной, приталенная футболка,
широкие тёмные джинсы, тёмная комната, вспышка. Принт ничем не закрыт, но он **низкоконтрастный
серый**, поэтому в полумраке легко размывается.

```
Slow-motion streetwear lookbook video, flash photography at night. Girl with big
voluminous auburn curly hair, freckles, dark red lips, hands held behind her back,
fitted black t-shirt with a grayscale pixel-art print of a girl in glasses and a
leather jacket, wide dark wash baggy jeans, dark empty room. The camera starts
slightly low at waist height and makes a slow smooth arc of about 15 degrees from
left to front, rising to chest level, ending on a medium shot from head to hips.
She slowly shifts her weight to one hip, opens her eyes and looks at the lens with
a lazy half-smile, her curls bounce gently in slow motion. Hands stay behind her
back the whole time. A soft frontal light keeps the print evenly lit and sharp.
Editorial, deep blacks, subtle grain.
```
+ блок «защита принта».

---

## 4 — «Падший ангел» (`src/4-padshiy.png`, 1:1)
Тёмные волосы с чёлкой, стрелки, подмигивает с высунутым языком, рука в волосах, зажжённая
зажигалка у лица, худи на молнии спущено с одного плеча, вспышка, чёрный фон.

**Внимание: сигарета есть на самом принте.** У ангела в зубах пиксельная сигарета. Принт менять
нельзя, это товар. Поэтому:
- огонь в кадре + сигарета на принте = ролик почти наверняка воспримут как «курение».
  **Зажигалку из ролика убираем обязательно**;
- для органики пиксельная сигарета на рисунке скорее не проблема. Но если будете
  продвигать ролик за деньги (Promote), модерация может отклонить именно этот кадр. Тогда
  делаем рекламную версию из трёх других футболок.

Как убрать зажигалку:
1. **Лучше всего:** до анимации удалить руку с зажигалкой с фото (генеративное удаление,
   например в Photoshop / Picsart / Fotor). Под рукой воротник и верх худи, это дорисовывается
   легко, принт не задет. Потом промпт **4А**.
2. Если удаление не вышло, промпт **4Б**: она гасит зажигалку и опускает руку, и в монтаж
   берём только вторую половину клипа.

### 4А — фото без зажигалки
```
Flash-photography fashion video, slow motion, 120fps look. Girl with dark wavy hair
and bangs, sharp winged eyeliner, one hand in her hair, black zip hoodie slipping
off one shoulder, black t-shirt with a gray pixel-art dark angel print with folded
wings, pure black background, harsh on-camera flash. The camera slowly pushes in
and rises slightly to eye level, ending on a medium shot from head to waist.
She slowly runs her fingers through her hair, winks at the camera and breaks into
a playful smile; hair falls softly in slow motion. One strobe flash pulse,
paparazzi y2k vibe, high contrast, film grain.
```
+ блок «защита принта» + в negative: `fire, flame, lighter, cigarette in hand`.

### 4Б — исходное фото
```
Flash-photography fashion video, slow motion. Girl with dark wavy hair and bangs, one
hand in her hair, black t-shirt with a gray pixel-art dark angel print, pure black
background, harsh flash. In the first second she snaps the lighter shut, the flame
disappears, and she lowers that hand down and out of the frame, away from the
print. Then she keeps winking and slowly smiles while the camera gently pushes in to
a medium shot. No flame after the first second, no smoke.
```
+ блок «защита принта» + в negative: `smoke, fire after first second`.

---

## Проверка клипа перед монтажом

- [ ] Принт на паузе (начало, середина, конец) совпадает с исходником. Серафим: крылья и бинты.
  Готика: глаза и чокер с сердцем. Сирена: очки и куртка. Падший: крылья, крест, нашивки.
- [ ] Принт не закрыт руками, волосами или худи дольше 0,3 с.
- [ ] Лицо модели и пирсинг не меняются.
- [ ] Пальцы в порядке (особенно 4 — рука в волосах).
- [ ] Фото 2: снизу не появилось дорисованного принта.
- [ ] Фото 4: в отобранном куске нет огня.

Если принт всё равно искажается, а движение удачное, при монтаже наложу чистый принт с
исходника с трекингом по груди.
