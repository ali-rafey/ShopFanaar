import { Link } from "react-router-dom";
import { useCatalog } from "../context/CatalogContext";
import { formatPrice } from "../lib/catalog";
import InfoLayout, { InfoSection } from "../components/InfoLayout";

export function Shipping() {
  const { settings } = useCatalog();
  const fee = settings?.shippingFee;
  const free = settings?.freeShippingThreshold;

  return (
    <InfoLayout
      eyebrow="Policies"
      title="Shipping"
      lead="Every order is packed by hand in Faisalabad and delivered across Pakistan, cash on delivery."
    >
      <InfoSection title="Confirmation & dispatch">
        <p>
          After you order, we call or WhatsApp you to confirm the details. Confirmed orders are
          dispatched within 1–2 working days.
        </p>
      </InfoSection>
      <InfoSection title="Delivery time">
        <p>
          Delivery takes 3–5 working days after dispatch to most cities in Pakistan. Remote areas
          can take a little longer.
        </p>
      </InfoSection>
      <InfoSection title="Shipping charges">
        {fee == null ? (
          <p>The shipping charge is shown at checkout before you place your order.</p>
        ) : (
          <p>
            {fee === 0 ? "Shipping is free on every order." : `Shipping is ${formatPrice(fee)} per order.`}
            {fee > 0 && free != null && ` Orders of ${formatPrice(free)} or more ship free.`} The
            exact amount is always shown at checkout.
          </p>
        )}
      </InfoSection>
      <InfoSection title="Cash on delivery">
        <p>
          Pay the courier in cash when your parcel arrives. Please keep the exact amount ready —
          it&apos;s shown on your order page.
        </p>
      </InfoSection>
      <InfoSection title="Tracking your order">
        <p>
          Your order confirmation links to an order page you can bookmark. Once your parcel ships,
          the courier and tracking number appear there.
        </p>
      </InfoSection>
      <InfoSection title="Questions">
        <p>
          <Link to="/pages/contact">Contact us</Link> with your order number and we&apos;ll help.
        </p>
      </InfoSection>
    </InfoLayout>
  );
}

export function Returns() {
  return (
    <InfoLayout
      eyebrow="Policies"
      title="Exchanges & returns"
      lead="If a piece doesn't fit the way you hoped, we'll help you swap it."
    >
      <InfoSection title="7-day exchanges">
        <p>
          You can exchange a piece within 7 days of delivery for a different size or another
          item, subject to availability.
        </p>
      </InfoSection>
      <InfoSection title="Condition">
        <p>
          Pieces must be unworn, unwashed and unaltered, with all tags attached and in their
          original packaging. Items that show wear or have had tags removed can&apos;t be
          exchanged.
        </p>
      </InfoSection>
      <InfoSection title="How to request an exchange">
        <ol>
          <li>
            <Link to="/pages/contact">Message us</Link> within 7 days of delivery with your order
            number, the piece you&apos;re returning and what you&apos;d like instead.
          </li>
          <li>We&apos;ll confirm the exchange and share where to send the piece.</li>
          <li>Once we receive and check it, we dispatch the replacement.</li>
        </ol>
      </InfoSection>
      <InfoSection title="Damaged or incorrect items">
        <p>
          If your order arrives damaged or isn&apos;t what you ordered, contact us within 7 days
          of delivery with your order number and a photo, and we&apos;ll put it right.
        </p>
      </InfoSection>
    </InfoLayout>
  );
}

export function Privacy() {
  return (
    <InfoLayout
      eyebrow="Policies"
      title="Privacy policy"
      lead="What we collect when you use shopfanaar.com, why, and who it's shared with."
      updated="10 October 2026"
    >
      <InfoSection title="What we collect">
        <ul>
          <li>
            <strong>When you order:</strong> your name, mobile number, delivery address, city,
            optional email and any delivery note, plus what you ordered.
          </li>
          <li>
            <strong>When you join our list:</strong> your email address.
          </li>
          <li>
            <strong>When you contact us:</strong> your name, the contact details you give and your
            message.
          </li>
          <li>
            <strong>On your device:</strong> your cart, saved pieces and (if you choose) your
            checkout details are stored in your own browser so they&apos;re there next time. We
            don&apos;t see these until you place an order.
          </li>
        </ul>
      </InfoSection>
      <InfoSection title="How we use it">
        <p>
          To confirm, pack and deliver your order, to contact you about it, to handle exchanges
          and questions, and — only if you joined our list — to tell you about new pieces and
          restocks. We don&apos;t sell your information.
        </p>
      </InfoSection>
      <InfoSection title="Who we share it with">
        <ul>
          <li>
            <strong>Courier partners</strong> receive your name, phone number and address so they
            can deliver your parcel and collect payment.
          </li>
          <li>
            <strong>Meta (Facebook/Instagram):</strong> we use the Meta Pixel and Meta&apos;s
            Conversions API to measure our ads. They record visits and actions such as viewing a
            product, adding to cart and purchasing, and use cookies in your browser. When you
            order, we also send Meta your mobile number, email (if given), name and city in hashed
            (one-way scrambled) form, along with the order value, so Meta can tell which ads led to
            orders.
          </li>
          <li>
            <strong>Service providers</strong> that run the website and store orders securely
            (our hosting and database providers), only to operate the store.
          </li>
        </ul>
      </InfoSection>
      <InfoSection title="Your choices">
        <p>
          You can ask us what information we hold about you, to correct it, or to delete it, and
          you can leave our email list at any time — just{" "}
          <Link to="/pages/contact">contact us</Link>. You can clear cookies and stored data in
          your browser settings, and manage ad preferences in your Meta account.
        </p>
      </InfoSection>
      <InfoSection title="Keeping it safe">
        <p>
          Orders are stored in a secured database that only authorised Fanaar staff can access.
          We keep order records as long as needed for delivery, exchanges and our accounts.
        </p>
      </InfoSection>
    </InfoLayout>
  );
}
