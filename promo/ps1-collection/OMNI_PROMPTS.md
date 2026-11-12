# PS1 collection — промпты для Omni (image-to-video)

Промпты на английском: видеомодели понимают его точнее. Комментарии на русском.

## Общие настройки для всех 4 генераций

- Соотношение **9:16**, длительность **5 с** (если есть 10 с, лучше сделать две по 5 с: на длинных клипах принт «плывёт» сильнее).
- Режим: image-to-video, исходное фото = первый кадр. Если Omni даёт задать **последний кадр**, ставьте туда **то же фото**. Тогда модель обязана вернуть футболку к оригиналу, и принт меньше искажается.
- Сила движения: низкая или средняя (motion 3–4 из 10). Чем сильнее движение, тем больше портится принт.
- Сгенерируйте 3–4 варианта на фото и оставьте тот, где принт чище. Проверяйте по паузе: лицо персонажа на принте, контуры крыльев, мелкие пиксели.
- Слоу-мо доделаем при монтаже (интерполяция кадров + замедление в 2 раза), поэтому в промпте просим «slow motion», но не 0.1x. Иначе модель начнёт «дорисовывать» лишнее.

### Блок «защита принта» — вставлять в конец КАЖДОГО промпта
```
The black t-shirt and its printed pixel-art graphic are the product: keep the print
exactly as in the reference image — same drawing, same colors, same proportions,
sharp pixel edges, fully visible, flat on the chest. No morphing, no warping,
no redrawing, no added details, no text changes. Fabric stays smooth across the
print, no deep folds or wrinkles over the graphic. Hands, hair and jacket never
cover the print.
```

### Negative prompt (если в Omni есть отдельное поле)
```
distorted print, warped graphic, morphing t-shirt design, changed print, blurry print,
melting pixels, extra limbs, deformed hands, extra fingers, face morphing, identity change,
text artifacts, logo, watermark, heavy fabric wrinkles over chest, fast motion, shaky camera,
smoke, cigarette
```

---

## Фото 1 — «Серафим в бинтах»
Каре с чёлкой, пирсинг, вспышка, чёрный фон, распахнутое худи.

```
High-fashion editorial video, slow motion, 120fps look. Pale girl with a sharp black
bob and bangs, facial piercings, open black hoodie over a black t-shirt with a
pixel-art angel print. Harsh direct on-camera flash, pure black studio background,
y2k grunge mood. The camera starts at chest height and makes a slow, smooth
arc of about 15 degrees to the left while slightly pushing in, ending on a
medium shot (head to waist). She slowly lifts her chin and turns her eyes to the
lens, a strand of hair drifts in a soft breeze, the hoodie edges sway gently
but stay open at the sides of the chest. Subtle flash flicker at the very start,
like a photoshoot strobe. Cinematic, crisp, high contrast, film grain.
```
+ блок «защита принта».

Риск: полы худи заезжают на принт. Если так, добавьте `the hoodie is pushed back off the shoulders and does not move`.

---

## Фото 2 — «Готика ракурс сверху»
Большие очки, длинные тёмные волосы, полумрак, зеленоватая стена, монитор справа.

```
Moody late-90s fashion video, slow motion. Girl with long dark hair and large
glasses in a dim room with a greenish wall, an old CRT monitor glowing on the
right. Black t-shirt with a pixel-art gothic girl print. The camera slowly
descends from a slightly high angle to eye level and gently dollies in,
ending on a medium shot. She slowly turns her head from the monitor toward the
camera and lightly pushes her glasses up with one finger (hand stays near the
face, away from the chest). The monitor light softly flickers and casts cool
cyan-green glow on her face and shoulders, faint dust particles float in the air.
Low-key lighting, but the t-shirt print is evenly lit and clearly readable.
Lo-fi PS1 cutscene atmosphere, soft film grain, shallow depth of field on
background only.
```
+ блок «защита принта».

Риск: в полумраке модель «съедает» принт в шум. Если так, усильте фразу: `a soft key light illuminates the chest so the print is bright and sharp`.

---

## Фото 3 — «Кибер-сирена в очках»
Объёмные рыжие кудри, руки за спиной, тёмная комната, широкие тёмные джинсы.

Лучший кадр для товара: руки за спиной, принт ничем не закрыт. Поэтому здесь можно больше движения камеры.

```
Slow-motion streetwear lookbook video. Girl with voluminous red curly hair, hands
held behind her back, black t-shirt with a pixel-art cyber girl print, wide dark
baggy jeans, dark room. The camera performs a slow, smooth low-angle orbit of about
20 degrees from front-left to front, rising from waist level to chest level,
showing the full outfit from knees up and then settling on a medium shot.
She shifts her weight from one leg to the other, slightly tilts her head, her
curls bounce softly in slow motion. A thin rim light outlines her silhouette
and hair, the chest area is lit with a soft frontal light. Hands stay behind
her back the whole time. Editorial, cinematic, deep blacks, subtle grain.
```
+ блок «защита принта».

---

## Фото 4 — «Падший ангел»
Тёмные волосы с чёлкой, зажжённая зажигалка, рука в волосах, подмигивает, вспышка, чёрный фон.

**Зажигалка.** Огонь в кадре — это риск: ТикТок может срезать охват, а в РФ это похоже на табак в рекламе. Варианты от лучшего к худшему:

1. **Лучше всего.** Сначала убрать зажигалку с фото: inpaint/генеративное удаление в любом редакторе, руку опустить или убрать из кадра. Потом анимировать по промпту **4А**.
2. Анимировать как есть, но промптом **4Б** заставить её **закрыть зажигалку и опустить руку** в первую секунду. В монтаж взять только хвост клипа без огня.
3. Не использовать. Плохой вариант, кадр с подмигиванием сильный.

### 4А — фото без зажигалки
```
Flash-photography fashion video, slow motion, 120fps look. Girl with dark hair and
bangs, one hand running slowly through her hair, black t-shirt with a pixel-art
dark angel print, pure black background, harsh on-camera flash. The camera slowly
pushes in and tilts slightly from a low angle to eye level, ending on a medium
shot. She slowly winks at the camera, then gives a small smirk, hair falling
softly through her fingers in slow motion. Strobe-like flash pulses twice,
paparazzi y2k vibe, high contrast, crisp, film grain.
```
+ блок «защита принта».

### 4Б — исходное фото, огонь гаснет
```
Flash-photography fashion video, slow motion. Girl with dark hair and bangs, one
hand in her hair, black t-shirt with a pixel-art dark angel print, pure black
background, harsh flash. In the first second she snaps the lighter shut, the
flame disappears, and she lowers that hand down and out of the frame. Then she
slowly winks at the camera and smiles while the camera gently pushes in to a
medium shot. No fire, no smoke after the first second. Paparazzi y2k vibe,
high contrast, film grain.
```
+ блок «защита принта» + в negative: `fire, flame, lighter, smoke, cigarette`.

---

## Проверка клипа перед монтажом

- [ ] Принт на паузе в первом, среднем и последнем кадре совпадает с оригиналом: лицо персонажа, крылья, крест/чокер на месте.
- [ ] Принт не закрыт руками, волосами или полами худи дольше 0,3 с.
- [ ] Лицо модели не «переезжает» в другого человека.
- [ ] Руки без лишних пальцев.
- [ ] Фото 4: в отобранном куске нет огня.

Если принт всё равно плывёт, а движение хорошее, клип не выбрасываем. При монтаже можно наложить чистый принт с исходного фото с трекингом по груди (для 5-секундного плана со слабым движением камеры это работает).
