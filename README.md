# reddit-osu-twitch vod bot
## Introduction
The bot is currently running on [/u/afk1337](https://www.reddit.com/user/afk1337/). It checks new score-posts by [/u/osu-bot](https://www.reddit.com/user/osu-bot/) and posts a comment with a timestamped VOD link if the player is streaming and a VOD is available.

It works by finding the score using osu's api and getting the timestamp of when the play was submitted and subtracting the map length adjusted for DT and HT mods. Then the bot finds the player's twitch channel's VODs and checks if the calculated timestamp happened during one of them. If so, it gets the VOD link and calculates the difference between the start of the VOD and the previously calculated timestamp to know how far into the VOD the play started. If the player is live but the VOD is not published, the bot will keep checking the channel to see if the VOD gets published eventually. If it does, it will also post a comment.

### FAQ
**Can the bot detect when a player pauses?**<br>
No.

**How does it know which osu profile belongs to which twitch account?**<br>
I map them manually.

**Why is it not tracking X player?**<br>
Send me a dm on [/u/afk1337](https://www.reddit.com/message/compose?to=u/afk1337&subject=add%20player) and I'll add them.

## Installation

### Prerequisites
- Install npm
- Install node js
- Watch [Bocchi the Rock](https://anilist.co/anime/130003/Bocchi-the-Rock/)

### Setup
- Run `npm install`. If you're using Raspbian the sqlite3 installation might be broken, but I managed to fix it using `apt-get install libsqlite3-dev` and `npm install sqlite3 --build-from-source --sqlite=/usr`
- Copy the `config.json.example` file and rename it to `config.json`
- Edit the `config.json` file and fill in your api tokens, change settings if you need to, etc.
- Run the bot using `node src/main.js`

#### Notes
- Avoid closing the bot unless its status is sleeping
- If you need to make changes to the database you can edit the `private.sqlite` and `public.sqlite` files

### Commands
**Add player:** run `node main.js player:add <osu_id> <twitch_name>`