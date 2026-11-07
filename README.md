<p align="center"><img src="static/brewza-logo-photo-full.png" width="220" alt="BREWZA logo"></p>

# BREWZA (free version: OpenStreetMap + Python + SQLite + optional Gemini)

# LIVE LINK- https://brewza-cafefinder.onrender.com
No Google Maps key and no credit card needed.

| Part | What is used | Cost |
|---|---|---|
| Map | Leaflet + OpenStreetMap tiles | Free |
| Cafes / bars / restaurants | OpenStreetMap data via the Overpass API (through your Python server) | Free |
| Area search | OpenStreetMap Nominatim (through your Python server) | Free |
| Database | SQLite file `brewza.db` | Free |
| "Ask BREWZA AI" | Gemini API free tier (optional) | Free, with limits |

## Quick start (VS Code)
1. Install Python 3.10+ (python.org). On Windows tick "Add Python to PATH".
2. VS Code -> File -> Open Folder -> this `brewza-free` folder.
3. Copy `.env.example` to `.env`. Fill in (all optional):
   - `OSM_CONTACT=` your email (OpenStreetMap asks apps to identify themselves)
   - `GEMINI_API_KEY=` free key from https://aistudio.google.com/apikey (turns on the AI box)
4. Run: double-click `run_windows.bat`, or on Mac run `bash run_mac.sh`.
   (or: `py -m pip install -r requirements.txt` then `py app.py` / `python3 ...` on Mac)
5. Open http://localhost:3000 and sign up.

## Important notes
- Free servers have fair-use rules: keep it to demo/student use. Results are cached 10 minutes. Don't hammer them.
- OpenStreetMap has NO ratings, prices or photos. BREWZA builds its own: ratings, spend per person and review photos come from BREWZA users, stored in your database. A new install starts empty, so places show "No reviews yet" until people review.
- Wi-Fi, outdoor seating, vegetarian, live music, wheelchair tags are added by volunteers. Missing tag = unknown.
- Gemini free tier: Google may use free-tier prompts to improve its products, so only place data and the typed request are sent (no usernames, no exact location). Limits and available free models change; if you see "model not available", set `GEMINI_MODEL` in `.env` to a free-tier model shown in Google AI Studio.
- Gemini's "Maps grounding" feature is NOT free-tier, and is not used here.
- Dev server only. For real deployment: HTTPS, a production server, a hosted database, and your own tile/data hosting (public OSM servers are not for heavy use).

## v2 additions: speed, photos, nearby chat
**Speed**
- Search results are cached per ~1-2 km map tile, so the second person in an area gets results instantly.
- Stale results are shown immediately while fresh ones load in the background (stale-while-revalidate).
- Backup map servers are only asked if the first is slow (hedged requests), so searches finish sooner without hammering the free servers.
- The browser also remembers your last results, so the list appears at once on your next visit.
- Render free services sleep after ~15 min idle; the first request then takes 30-60 s. A free uptime pinger (e.g. UptimeRobot hitting `/api/config` every 5 min) keeps it awake.

**Photos**
- OpenStreetMap has no photos. BREWZA shows: (1) community photos uploaded by users (stored in the database, served from `/api/photos/<id>`, reportable: 3 reports hide a photo), (2) a Wikimedia Commons photo where volunteers tagged one (credited), (3) an emoji placeholder otherwise.
- Photos from Google Places are not free (billing-enabled key needed), so they are not used.

**Live chat near you**
- Rooms: Nearby (~1-2 km, built from ~1 km grid squares + their 8 neighbours), City, Lounge, and one room per place.
- Only the coarse grid-square number is sent for chat. Your exact position is never shared. Users can report messages (3 reports hide a message).
- Polling backs off (2 s -> 4 s -> 8 s) when quiet and pauses while the tab is hidden. Old messages are pruned after 7 days.
- Honest limits: grid squares are sent by the browser and can be faked; polling is not true real time; online counts live in server memory. For a large audience: WebSockets + Redis pub/sub + PostgreSQL, behind several app servers.

## v3: logo + intro animation
- `static/logo.svg` is the BREWZA logo (a steaming glass cup on a lavender-to-peach badge). It is used in the header, the login box and as the favicon.
- `static/intro.js` plays a ~6 s intro: the cup steams, the steam gathers into the BREWZA wordmark, a gust of wind blows it away, then the login (or the app) appears.
  Click, tap, Esc/Enter/Space or "Skip" skips it. It plays once per browser tab; add `?intro` to the address to replay it. It is skipped for people who enable "reduce motion".
- While the intro plays, the app loads behind it. If the free Render server is still waking up when the intro ends, a "Warming up the café..." screen is shown until it is ready.
## Logo
`static/brewza-logo-photo-full.svg` (and `.png`) is the BREWZA logo: your own photo of two friends at a café with an iced matcha and an iced latte as heads,
colour-softened into the BREWZA pastel look (the drinks stay vivid), with the "Me"/"You" captions removed and hand-drawn doodles on top
(kawaii faces, straws, sparkles, hearts, sticker outlines). It is used in the header, the login box, the intro animation and as the browser tab icon.
`static/logo-icon.svg` is an optional compact version (just the two drinks) if you ever want a crisper tiny icon.
The photo is embedded inside the SVG, so make sure everyone in it is happy before the repository is public.
