import stripe from "./stripe.js";
import { User, PhotoStudioSubscription, sequelize } from "../models/index.js";
export async function ensurePhotoStudioCustomer(user) {
  return sequelize.transaction(async (transaction) => {
    await User.findByPk(user.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    let record = await PhotoStudioSubscription.findOne({
      where: { userId: user.id },
      transaction,
    });
    if (!record)
      record = await PhotoStudioSubscription.create(
        { userId: user.id },
        { transaction },
      );
    if (!record.stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email,
          name: user.ownerName || undefined,
          metadata: {
            userId: user.id,
            product: "photo_studio",
            application: "fussy-panda",
          },
        },
        { idempotencyKey: `fussy-panda:customer:${user.id}` },
      );
      await record.update({ stripeCustomerId: customer.id }, { transaction });
    }
    return record.stripeCustomerId;
  });
}
