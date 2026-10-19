import LegalDocument from "@/components/legal/LegalDocument";

export default function AcceptableUsePage() {
  return <LegalDocument title="Acceptable Use Policy" summary="These rules protect farms, users, marketplace participants and the integrity of CropNex data.">
    <h2>You must not</h2>
    <ul>
      <li>impersonate another person or submit false verification documents;</li>
      <li>create misleading grain listings, bids, transport offers or farm records;</li>
      <li>access another organisation’s information without permission;</li>
      <li>upload malware, unlawfully collected data or material that infringes another person’s rights;</li>
      <li>interfere with security, availability, authentication or role controls;</li>
      <li>use plans or product rates in breach of labels, law, safety rules or professional requirements; or</li>
      <li>scrape, resell or systematically extract platform data without written permission.</li>
    </ul>
    <h2>Enforcement</h2>
    <p>CropNex may remove content, request more information, limit features or suspend an account while suspected misuse is investigated. Serious or unlawful conduct may be reported to the appropriate authorities.</p>
    <h2>Reporting concerns</h2>
    <p>Report suspicious accounts, unsafe content, false listings or security concerns through CropNex support as soon as possible.</p>
  </LegalDocument>;
}
