# Shot and camera grammar

Name the move and state what it reveals. A **push in** begins at zoom 1.00 and ends near 1.08–1.18 over 2–4 s, toward a real control or result. A **pull back** begins near 1.15 and ends at 1.00 to restore context. A **pan** shifts `x` by roughly 0.05–0.12 while holding zoom; use it only when the next subject lies in that direction. A **punch** can jump toward 1.25–1.6 for 0.25–0.5 s at a click or reveal, then hold. A **static hold** is valid when the viewer needs 1–2 s to read proof.

Write keys in media `camera:[{"at":"0s","zoom":1,"x":0.5,"y":0.5,"ease":"out"},...]`. `x` and `y` are normalized focus coordinates, not pixel offsets. `ease` accepts `linear|in|out|inout|punch`; there is no named bezier field. A captured app can use `camera:{"auto":"events","zoom":1.6,"hold":"0.8s"}`. Review that crop around each action and replace with manual keys if context disappears.

Shot order for a feature: 1) wide real UI for 1.5–2 s, 2) medium crop on input for 2–3 s, 3) close proof result for 2–4 s, 4) wide return for 1–2 s. Keep one dominant screen movement direction across adjoining shots. If a panel moves left, cut to a leftward pan or still; reversing direction needs a narrative reset.
