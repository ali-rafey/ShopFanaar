import { shop } from "../data/store";

export default function About() {
  return (
    <div className="wrap about">
      <h1>About Fänaar</h1>
      <p>{shop.tagline}</p>
      <p>
        Fänaar is a menswear label {shop.origin}, built by passionate
        individuals with a belief that clothing should be sophisticated yet
        comfortable. Every piece — from drop needle knits to lightweight
        interlock shirts — is considered for the way it feels, moves, and lasts.
      </p>
      <p>
        Autonomy by Fänaar explores fabrication itself: knitting, weaving, and
        the textures that give each garment its character.
      </p>
    </div>
  );
}
