# Room photos for the member app

Drop a landscape JPG here named by the space id and it appears automatically
in the app's Book tab (list thumbnail + arched hero on the room's calendar).
No code changes needed. ~1200px wide is plenty; keep files < 300 KB.

- hx_mr_north.jpg     — North
- hx_mr_south.jpg     — South
- hx_mr_east.jpg      — East
- hx_mr_west.jpg      — West
- hx_mr_central.jpg   — Central
- hx_mr_sky.jpg       — Sky
- hx_mr_earth.jpg     — Earth
- hx_studio_1.jpg     — Media Studio 1
- hx_podcast_1.jpg    — Podcast Room 1

Alternatively set a `photo` URL on the space record (spaces table, data.photo)
— that wins over these files. Rooms without either show the monogram plate.
