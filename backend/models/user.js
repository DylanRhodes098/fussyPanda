import { DataTypes, Model } from "sequelize";
import bcrypt from "bcryptjs";
import sequelize from "../lib/db.js";
import { ACCOUNT_TYPES } from "../lib/accountTypes.js";
import { password as passwordSchema } from "../validation/user.js";

class UserModel extends Model {
  toJSON() {
    const values = { ...this.get() };
    delete values.password;
    delete values.tokenVersion;
    delete values.providerId;
    return values;
  }
  async checkPassword(password) {
    return Boolean(this.password) && bcrypt.compare(password, this.password);
  }
}
async function hashPassword(user) {
  if (user.changed("password") && user.password !== null) {
    passwordSchema.parse(user.password);
    user.password = await bcrypt.hash(user.password, 10);
  }
}
const User = UserModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ownerName: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING(50), allowNull: true },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    avatar: { type: DataTypes.STRING, allowNull: true },
    password: { type: DataTypes.STRING, allowNull: true },
    authProvider: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "local",
    },
    providerId: { type: DataTypes.STRING, allowNull: true },
    accountType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ACCOUNT_TYPES.PHOTO_STUDIO,
      validate: { isIn: [[ACCOUNT_TYPES.PHOTO_STUDIO]] },
    },
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    hooks: { beforeCreate: hashPassword, beforeUpdate: hashPassword },
  },
);
export { User };
export default User;
