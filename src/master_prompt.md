# Multiplayer UNO Game — Project Brief

## 1. What I Want

I want a website where my friends and I can play UNO together online, without needing to install anything or make an account. Someone picks a name, creates a room, sends the room code to friends, and everyone plays together in real time — cards animate, turns update instantly for everyone, and at the end there's a winner and a scoreboard.

Think **skribbl.io**, but for UNO. That's the vibe: fast to join, no friction, casual, and fun to look at.

I want four ways to play:

1. **Normal UNO** — the classic game everyone already knows.
2. **UNO No Mercy** — the brutal modern variant with stacking draw cards, hand swaps, hand passes, and elimination.
3. **UNO Flip** — the double-sided deck version with a Light side and a Dark side.
4. **UNO DOS** — I'll provide the rules for this later. Don't guess at how it works — just leave room for it.

---

## 2. How Someone Gets Into a Game

No login screens, no passwords, no email verification, no "forgot password" flow — none of that. A player opens the site, types a display name, and they're in. That's the entire signup process. Two different people can both call themselves "Alex" — that's fine, don't block it.

If someone closes their laptop or their WiFi drops mid-game, they shouldn't lose their seat. When they come back and re-enter the same name in the same room, they should slide right back into their hand, their cards, their turn position — like nothing happened. This matters a lot to me — losing your cards because your phone died for ten seconds would ruin the game.

If someone opens a second browser tab, that should count as a *second* player, not the same one — so people can test with multiple tabs, or genuinely play as different people from the same computer.

There's no game history, no profile page, no stats tracking across games. None of that exists in this app — it's just "play right now."

---

## 3. The Room & Lobby Experience

**Creating a room:** the host picks how many players can join (anywhere from 2 up to 12) and which of the four game modes to play. The app generates a short room code — something like `X7K9P2` — that's the only way anyone gets in. No public room list, no browsing open games. You get in with a code or you don't get in.

**The lobby** is where everyone waits before the game starts. It should clearly show:

- The room code (so it's easy to copy/share)
- Which game mode is selected
- How many players have joined out of the max
- Everyone's name, who's the host (crown icon or similar), and whether they're currently connected
- A way to leave

Everyone in the lobby should see updates instantly — if someone joins, leaves, or the host changes a setting, every screen updates without anyone refreshing the page.

**The host** is whoever created the room. They can change the game mode and max players while everyone's still waiting, kick anyone who's being a problem, and start the game when ready. If the host leaves — at any point, even mid-game — host powers should automatically pass to someone else still in the room, instantly, with no broken in-between state where there's no host. Regular players can't touch settings, can't kick anyone, can't start the game, and obviously can't peek at or edit their own cards outside of legal moves.

---

## 4. The Game Itself

This is where the real detail matters — please follow these rules exactly, they're the actual rules of each variant and I don't want a "close enough" version.

### Normal UNO

Standard rules. Each player gets 7 cards. Match the top card by color, number, or symbol, or play a Wild anytime. If you can't play, draw one card — if it's playable, you can play it right away.

- **Skip** — next player loses their turn.
- **Reverse** — direction flips. (With only 2 players, Reverse just acts like a Skip.)
- **Draw 2** — next player draws 2 and is skipped.
- **Wild** — pick the next color.
- **Wild Draw 4** — pick the color, next player draws 4 and is skipped. You're only allowed to play this if you have no card matching the current color — that has to be enforced properly, not just trusted.
- **Draw cards stack.** A Draw 2 can be answered with another Draw 2 or a Wild Draw 4, passing an escalating penalty down the line, until someone can't or won't continue the chain — then they draw the entire accumulated total and lose their turn. (Example: Draw 2 → Draw 2 → Wild Draw 4 stacked in a row means the next player draws 8.)
- Get down to 1 card, you have to declare "UNO." If someone catches you before your next turn starts and you didn't declare, you draw 2 as a penalty.
- First to empty their hand wins the round. Everyone else's remaining cards convert to points for the winner (number cards = face value, Skip/Reverse/Draw2 = 20, Wilds = 50). Play multiple rounds until someone hits 500 points — that person wins the match.
- **Optional "0-7 Rule" house rule (host-toggled, off by default):** when enabled at room creation, playing a **0** passes every player's hand to the next player in turn order (same direction), and playing a **7** lets the player who played it pick anyone to swap their entire hand with, immediately. This mirrors No Mercy's mandatory 0/7 mechanic (see below) but stays off unless the host turns it on for a Normal UNO room.

### UNO No Mercy

This is a completely different beast from Normal UNO — please build it as its own ruleset, not a few cards bolted onto the normal game.

- **Draw cards stack.** A +2 can be answered with another +2, or a +4, +6, or +10, passing an escalating penalty down the line, until someone can't or won't continue the chain — then they draw the *entire* accumulated total and lose their turn. (Example: +2 → +4 → +6 → +10 stacked in a row means the next unlucky player draws 22 cards.)
- **Playing a 7** forces you to pick someone and swap your entire hand with theirs, immediately.
- **Playing a 0** passes everyone's hand to the next player in turn order, all at once.
- **The Mercy Rule:** if a player's hand ever hits 25 cards or more (from a draw penalty, a swap, or a pass), they're eliminated immediately — out of the game, no more turns.
- Extra cards in this deck: Draw 6, Draw 10, Wild Draw 6, Wild Draw 10, and Skip Everyone (skips every other player and the person who played it goes again).
- You can win this mode two ways: empty your hand first, **or** be the last player standing after everyone else gets eliminated.
- Same UNO-declaration-at-one-card rule as Normal UNO applies here too.

### UNO Flip

Every card in this deck has two faces — a Light side and a Dark side. Everyone starts on the Light side, playing normally.

When someone plays a **FLIP** card, everything flips at once — everyone's hand, the draw pile, the discard pile, all flip to their other face simultaneously, and play continues on the opposite side. Play another FLIP later and it flips everyone back.

Light side cards: Skip, Reverse, Draw 1, Wild, Wild Draw 2, Flip.
Dark side cards: Draw 5, Reverse, Skip Everyone, Wild, Wild Draw Color (next player draws until they pull a card of the chosen color), Flip.

**Draw cards stack**, same as Normal UNO and No Mercy: on the Light side, Draw 1 can be answered with another Draw 1 or a Wild Draw 2, escalating until someone can't or won't continue the chain and draws the accumulated total. On the Dark side, Draw 5 is the only draw card, so a Draw 5 can be answered with another Draw 5. A stack started on one side is resolved (or drawn) before any Flip card changes sides — Flip does not carry a pending stack across the flip. Same UNO-at-one-card declaration rule applies. First to empty their hand wins — no elimination mechanic here.

### UNO DOS

Hold off on this one. I know it plays differently — there's a center row of multiple discard piles instead of just one, and its own version of the "last card" call — but I haven't given you the actual authoritative rules yet, so don't guess or improvise a version of it. Leave the door open in the design for a fourth mode, but don't build the logic until I hand you the real ruleset.

---

## 5. Things That Matter Across Every Mode

- **Turn order has to be bulletproof.** Nobody should ever be able to play out of turn, play a card they don't have, or play an illegal card — even if their app is glitchy, laggy, or someone's trying to cheat. If two people somehow try to act at the exact same moment (e.g., during a reconnect), only one action should ever go through cleanly.
- **Other players' hands stay private.** You should only ever see *how many* cards your opponents have, never what those cards are.
- **Reconnecting mid-game has to just work.** Dropped connection, closed tab, phone died — when they're back, they should see the current, accurate game state immediately, not something stale or broken.
- **Turn timer (optional).** I'd like the host to be able to set a timer per turn — off, 15s, 30s, or 60s. If time runs out, the game should handle it automatically (e.g., auto-draw and pass), not just hang waiting for that player forever.
- **Errors should make sense to a human.** "That's not your turn" or "Room is full," not a stack trace or a cryptic code.

---

## 6. What the Finished Product Should Look and Feel Like

**Landing → name entry.** A clean, welcoming landing page. One field: your display name. Submit, and you're straight into the main panel — no waiting, no extra steps.

**Main panel.** Shows your current name and two clear choices: Create Room or Join Room. Maybe a way to change your name. Nothing else clutters this screen — no menus for settings, history, or profile, because none of that exists here.

**Room creation screen.** Pick your player limit (a slider or stepper from 2–12) and your game mode (four clear cards or buttons — Normal, No Mercy, Flip, DOS-coming-soon). Hitting "Create" takes you straight into the lobby with your new room code front and center, easy to copy.

**Lobby.** A live-updating screen: room code, mode, player count, and a list of everyone in the room with a crown on the host and a status dot (green/grey) for connection. The host sees extra controls (kick buttons, settings, a Start Game button); everyone else just watches and waits.

**The game table** is the centerpiece of the whole app — it needs to feel alive:

- Players arranged around a table (or in a row on mobile), each showing their name, avatar/seat, and card count — not their actual cards.
- Your own hand at the bottom of the screen, big, clear, and tappable/clickable — illegal cards should be visually obvious (greyed out or similar) so you're not guessing what you're allowed to play.
- The draw pile and discard pile front and center, with the current top card clearly visible.
- Clear indicators for: whose turn it is, which direction play is going, the active color, the active side (Light/Dark, in Flip mode), and any pending stacked penalty (in No Mercy).
- A visible turn timer when one is active.
- Smooth animations for drawing a card, playing a card, flipping the whole table (Flip mode), swapping or passing hands (No Mercy), and a satisfying celebration animation when someone wins.
- A clear, unmissable way to hit "UNO!" when you're down to one card, and a way to call out someone else who forgot.

**Game results screen.** Big, celebratory "Game Over" moment. Winner front and center, then a final standings list underneath (rank, name, score). Three clear buttons: Play Again (same room, new game), Return to Lobby, or Return to Main Menu.

**Overall feel:** polished and modern, not sterile — this is a party game, it should feel a little fun and playful, similar in spirit to skribbl.io's energy. It needs to work well on desktop, tablet, and phone, since people will be playing from whatever device is in their hand when a friend sends them the room code.

---

## 7. Ground Rules for Building This

- Don't guess at a rule I haven't given you. If something about a mode is unclear or missing (like UNO DOS right now), stop and ask rather than inventing a version of it.
- The server is always the referee — the app on someone's phone or laptop should never be trusted to decide what's a legal move. All game logic lives in one authoritative place, and every client just reflects whatever that authority says is true.
- Keep the rules for each mode cleanly separated from each other so that adding UNO DOS later — or any future variant — doesn't mean rewriting everything that already works.
