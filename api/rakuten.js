export default async function handler(req, res) {
  // ★ ここにあなたのIDを入れてください
  const APP_ID = "53b7a99b-f13a-40b4-bb42-f40a2d198f56";
  const AFF_ID = "5293020a.dd20fd9b.5293020b.265498fa";

  const { keyword } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: "keyword is required" });
  }

  try {
    const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=${APP_ID}&affiliateId=${AFF_ID}&keyword=${encodeURIComponent(keyword)}&hits=3&sort=-reviewCount&imageFlag=1&genreId=100371`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.Items && data.Items.length > 0) {
      const items = data.Items.slice(0, 3).map(it => ({
        name: it.Item.itemName.substring(0, 50) + (it.Item.itemName.length > 50 ? "..." : ""),
        price: it.Item.itemPrice,
        img: it.Item.mediumImageUrls[0]?.imageUrl || "",
        url: it.Item.affiliateUrl || it.Item.itemUrl,
      }));
      res.setHeader("Cache-Control", "s-maxage=3600");
      return res.status(200).json({ items });
    } else {
      return res.status(200).json({ items: [] });
    }
  } catch (e) {
    return res.status(500).json({ error: "API request failed" });
  }
}
