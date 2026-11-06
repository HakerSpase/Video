# КРАНЧИ — рекламный шортс в стиле «абсурдной документалки»

Формат как у референса (козёл на пряничной фабрике): спокойный бесстрастный голос рассказывает
про странную работу животного так, будто это нормально. Реалистичная, чуть «угловатая» 3D-картинка
как в катсцене старой игры, тёплый тусклый свет, коричнево-зелёная гамма. Субтитры — одно слово
по центру пиксельным шрифтом. Длина ~45 с. В конце — настоящая пачка из презентации, анимированная.

Герой — **Бык-пекарь**: огромный, мускулистый, в белой майке и рабочих штанах, на заводе чипсов.
Второстепенная — **Корова** в сеточке для волос, ничего не подозревает.

---

## Как делить работу

| Кто | Что |
|---|---|
| ты (Google Flow) | 2 картинки персонажей → 11 коротких клипов по промптам ниже |
| ты (AI Studio) | озвучка текста `voice_text.txt`, голос и стиль — в `VOICE.md` |
| я | монтаж под голос, субтитры по слову как в референсе, звуки, финал с анимированной пачкой, обложка |

Кредиты: на AI Pro 1000 кредитов в месяц; Veo **Fast** ≈ 20 кредитов за клип → 11 клипов + переделки
≈ 300–400 кредитов. Режим Quality не нужен — стиль и так «угловатый».

---

## Шаг 1. Персонажи (Flow → Create image / «Изображение»)

Сделай по 2–4 варианта, выбери лучший, сохрани. Эти картинки потом добавляешь в каждый клип
как **Ingredients** (ингредиенты), чтобы бык был одним и тем же.

**BULL.png**
```
Full-body portrait of an anthropomorphic bull baker: huge muscular body, bull head with short horns and a brass nose ring, calm tired eyes, white sleeveless undershirt with flour stains, dark work trousers, white sneakers, a small paper baker cap. Standing in a small dim snack factory. Realistic but slightly low-poly 3D CGI look, like an early-2000s video game cutscene, faceted skin texture, warm tungsten light, muted brown and olive-green palette, soft film grain. Vertical 9:16.
```

**COW.png**
```
Full-body portrait of an anthropomorphic dairy cow factory worker: black-and-white cow head, white hairnet, white lab coat, rubber gloves, holding a clipboard, suspicious neutral expression. Same style: realistic but slightly low-poly 3D CGI, early-2000s video game cutscene, warm tungsten light, muted brown and olive-green palette, film grain. Vertical 9:16.
```

**PACK** — пачка уже есть: `assets/pack_front.png` (пришлю файлом). Добавляй её ингредиентом в клипы, где видна пачка.

---

## Шаг 2. Клипы (Flow → Ingredients to Video, 9:16, Veo Fast, 8 с)

В **каждый** промпт в конце добавляй общий хвост стиля (он уже вставлен ниже).
Ингредиенты: BULL всегда; COW и PACK — где указано.
Если Flow сам добавил речь или музыку — ничего страшного, звук я заменю.

**01 — утро** (BULL)
```
The bull baker slides a large metal tray of round golden baked chips into an old industrial oven, closes the door, looks straight at the camera without emotion. Static medium shot. Small dim snack factory, stacks of trays, flour in the air. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**02 — фритюр запретили** (BULL)
```
Flashback: the bull baker stands next to a giant bubbling deep fryer, his hands dripping with oil; greasy handprints cover the walls, the door, a computer keyboard and a phone on the table. A sign on the fryer says "НЕ ЖАРИТЬ". He looks at his hands sadly. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**03 — жирный начальник** (BULL)
```
A small nervous human factory manager in a suit stands frozen, his white shirt and tie covered in huge greasy hoof prints. The bull baker behind him slowly pats him on the shoulder, leaving another greasy print. Static shot, deadpan. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**04 — остатки сыра** (BULL)
```
Close-up: the bull baker pours a crate of cheese rinds and cheese trimmings and a bucket of whey into a big industrial dough mixer together with orange lentils. The mixer spins. He sniffs, nods seriously. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**05 — корова не знает** (BULL + COW)
```
In the background the cow worker in a hairnet walks past with a clipboard. In the foreground the bull baker quickly hides a wheel of cheese behind his back and looks away innocently. The cow stops and stares suspiciously. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**06 — белок** (BULL)
```
The bull baker holds one small round baked chip between two huge fingers, looks at it, eats it, then slowly flexes his enormous biceps; a button flies off a nearby lab coat. Low angle medium shot. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**07 — пластик не ест** (BULL + PACK)
```
The bull baker bites a shiny metallic plastic chip bag, chews, grimaces and spits it out into a trash bin. Then he picks up the kraft paper pouch from the reference image and nods with approval. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**08 — оторви и посади** (BULL + PACK)
```
Close-up of the bull's huge hands: he carefully tears the small paper label off the kraft chip pouch from the reference image, puts it into a tiny flower pot with soil, and waters it with a tiny watering can. Very gentle movements. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**09 — клевер ест корова** (COW)
```
Time-lapse: green clover sprouts grow fast in a tiny flower pot on a windowsill of the factory. The cow worker in a hairnet leans in and eats the whole clover in one bite, chewing calmly while looking at the camera. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**10 — бизнес-план** (BULL)
```
The bull baker stands proudly in front of a whiteboard with a hand-drawn circle diagram: clover → cow → milk → cheese → chips → clover. He taps the board with a marker. Static shot, deadpan. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

**11 — красный датчик** (BULL + PACK)
```
Close-up of the kraft chip pouch from the reference image on a table; its small round freshness indicator changes from green to red. Camera tilts up: the bull baker is sitting behind the pouch with crumbs on his face, chewing slowly, avoiding eye contact. Characters do not speak. Realistic slightly low-poly 3D CGI like an early-2000s video game cutscene, faceted textures, warm tungsten light, muted brown and olive-green palette, film grain, vertical 9:16.
```

Если какой-то клип не выходит за 2–3 попытки — пропусти, перекрою его другим клипом или финальной анимацией.

---

## Шаг 3. Что прислать мне

- 11 клипов (`01.mp4` … `11.mp4`, можно как есть из Flow);
- озвучку (`voice.wav`) по `VOICE.md`.

Дальше: монтаж под голос, субтитры по слову пиксельным шрифтом как в референсе, звуки (печь, миксер,
хруст, «чавк» коровы), финал: пачка падает в кадр, ярлык отрывается, вырастает клевер, датчик
мигает зелёным, «КРАНЧИ. Запечено, не жарено. 24 г белка» и обложка последним кадром.
