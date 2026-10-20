import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";
export default class GuestSession extends Model {}
GuestSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    secretHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
    },
    claimedByUserId: { type: DataTypes.UUID, allowNull: true },
    claimedAt: DataTypes.DATE,
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    lastWorkAt: DataTypes.DATE,
    ipHash: DataTypes.STRING(64),
  },
  { sequelize, modelName: "GuestSession", tableName: "guestSessions" },
);
