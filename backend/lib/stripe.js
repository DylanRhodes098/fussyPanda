import Stripe from "stripe";
let client;
export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error("Billing is not configured");
    error.code = "BILLING_NOT_CONFIGURED";
    throw error;
  }
  return (client ||= new Stripe(process.env.STRIPE_SECRET_KEY));
}
export default new Proxy(
  {},
  {
    get(_target, key) {
      return getStripe()[key];
    },
  },
);
