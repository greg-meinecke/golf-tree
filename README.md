# Trip Tree — Golf Trip Hall of Fame

Interactive tree visualization of the golf trip's member hierarchy.

## Quick Start

```bash
# Copy example data to create your real data file
cp data/members.example.json data/members.json

# Edit with real member info
# (see schema below)

# Run locally
python3 -m http.server 8000
# Open http://localhost:8000
```

## Data Schema

`data/members.json` is a flat array of member objects. The `sponsor` field creates the tree structure.

```json
{
  "id": "john_doe",
  "name": "John Doe",
  "nickname": "Big John",
  "sponsor": null,
  "lord": true,
  "years_attended": [2018, 2019, 2020],
  "wins": 2,
  "funny_story": "Once drove a cart into the lake...",
  "photo": "images/members/john_doe.jpg",
  "hometown": "Austin, TX"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (used by `sponsor` field) |
| `name` | string | Display name |
| `nickname` | string | Optional nickname |
| `sponsor` | string\|null | `id` of the member who brought them. `null` = lord (root node) |
| `lord` | boolean | Founding member flag |
| `years_attended` | number[] | Array of years attended |
| `wins` | number | Total wins |
| `funny_story` | string | Story shown in detail panel |
| `photo` | string | Path to photo (optional, shows initial if missing) |
| `hometown` | string | Hometown |

## Swapping in Real Data

1. `cp data/members.example.json data/members.json`
2. Edit `members.json` with real names, stories, etc.
3. Drop photos into `images/members/` matching the `photo` paths
4. `members.json` and photos are gitignored — your real data stays local

## Deploy

```bash
# S3
aws s3 sync . s3://your-bucket --exclude ".git/*" --exclude "data/members.example.json"

# After updating, invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```
