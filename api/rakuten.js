export default async function handler(req, res) {
  const APP_ID = "pk_UQlFSQbSHMs6Wz2IiWbxUgvvfUXFr5wcFCqimCRgtlB";
  const AFF_ID = "5293020a.dd20fd9b.5293020b.265498fa";
  const keyword = req.query.keyword || "Tシャツ";

  const url = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=" + APP_ID + "&affiliateId=" + AFF_ID + "&keyword=" + encodeURIComponent(keyword) + "&hits=3&sort=-reviewCount&imageFlag=1";

  try {
    const response = await fetch(url);
    const text = await response.text();
    return res.status(200).json({ debug_url: url, debug_status: response.status, debug_body: text.substring(0, 500) });
  } catch (e) {
    return res.status(200).json({ debug_error: e.message });
  }
}
