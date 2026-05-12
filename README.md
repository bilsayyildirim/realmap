# World Food Culture Map

This project visualizes the world's food cultures by grouping cities and regions based on the ingredients they use and the ways they cook, then coloring each group so you can instantly see which places are similar or different. For example, it compares things like olive oil and pasta in Italy, soy sauce and rice in Japan, or barbecue and cornmeal in the American South, and assigns similar colors to groups with similar food cultures—so places with related cuisines appear in related colors on the map.

**Algorithms used:**

- UMAP (for finding patterns in food data)
- HDBSCAN (for grouping similar places)
- Max-Min ΔE color assignment (for making each group's color as distinct as possible)
- LCh color space (for perceptually accurate color selection)
