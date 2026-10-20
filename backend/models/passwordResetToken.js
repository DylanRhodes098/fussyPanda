import { DataTypes, Model } from "sequelize";
import sequelize from "../lib/db.js";

class PasswordResetTokenModel extends Model {}

const PasswordResetToken =
  sequelize.models.PasswordResetToken ||
  PasswordResetTokenModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "PasswordResetToken",
      tableName: "passwordResetTokens",
      timestamps: true,
    },
  );

export { PasswordResetToken };
export default PasswordResetToken;
