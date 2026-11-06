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
