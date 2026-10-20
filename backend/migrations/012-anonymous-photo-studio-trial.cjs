const ownedTables = [
  "photoStudioEnvironments",
  "photoStudioGenerations",
  "photoStudioChats",
  "photoStudioCreditBuckets",
  "photoStudioCreditLedgerEntries",
];
exports.up = async (q, S) => {
  await q.createTable("guestSessions", {
    id: { type: S.UUID, primaryKey: true, allowNull: false },
    secretHash: { type: S.STRING(64), allowNull: false, unique: true },
    status: { type: S.STRING, allowNull: false, defaultValue: "active" },
    claimedByUserId: {
      type: S.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
    },
    claimedAt: S.DATE,
    expiresAt: { type: S.DATE, allowNull: false },
    lastWorkAt: S.DATE,
    ipHash: S.STRING(64),
    createdAt: { type: S.DATE, allowNull: false },
    updatedAt: { type: S.DATE, allowNull: false },
  });
  await q.addIndex("guestSessions", ["status", "expiresAt"]);
  await q.addIndex("guestSessions", ["ipHash", "createdAt"]);
  for (const table of ownedTables) {
    await q.changeColumn(table, "userId", { type: S.UUID, allowNull: true });
    await q.addColumn(table, "guestId", {
      type: S.UUID,
      allowNull: true,
      references: { model: "guestSessions", key: "id" },
      onDelete: "CASCADE",
    });
    if (table !== "photoStudioEnvironments")
      await q.addIndex(table, ["guestId"]);
    // MySQL forbids CHECK on columns with cascading FKs. BEFORE triggers enforce exactly one owner.
    for (const event of ['INSERT','UPDATE']) await q.sequelize.query(`CREATE TRIGGER ${table}_owner_${event.toLowerCase()} BEFORE ${event} ON ${table} FOR EACH ROW BEGIN IF (NEW.userId IS NULL) = (NEW.guestId IS NULL) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Exactly one studio owner is required'; END IF; END`);

  }
  await q.addIndex("photoStudioEnvironments", ["guestId"], { unique: true });
  await q.addIndex("photoStudioEnvironments", ["userId"], {
    name: "photoStudioEnvironments_userId_lookup",
  });
  await q.removeIndex(
    "photoStudioEnvironments",
    "photoStudioEnvironments_userId_unique",
  );
  await q.changeColumn("photoStudioGenerations", "environmentId", {
    type: S.UUID,
    allowNull: true,
  });
  for (const column of ["environmentImageUrl", "environmentStoragePath"])
    await q.changeColumn("photoStudioChats", column, {
      type: S.TEXT,
      allowNull: true,
    });
  await q.createTable("photoStudioFiles", {
    id: { type: S.UUID, allowNull: false, primaryKey: true },
    userId: { type: S.UUID, allowNull: true },
    guestId: { type: S.UUID, allowNull: true },
    storagePath: { type: S.STRING(512), allowNull: false, unique: true },
    previewPath: { type: S.STRING(512), allowNull: false },
    createdAt: { type: S.DATE, allowNull: false },
    updatedAt: { type: S.DATE, allowNull: false },
  });
  await q.addIndex("photoStudioFiles", ["userId"]);
  await q.addIndex("photoStudioFiles", ["guestId"]);
  await q.addConstraint("photoStudioFiles", {
    fields: ["userId", "guestId"],
    type: "check",
    name: "photoStudioFiles_one_owner",
    where: S.literal("(userId IS NULL) <> (guestId IS NULL)"),
  });
};
exports.down = async (q, S) => {
  // Downgrade only after guest work has been expired/claimed and files cleaned through the application.
  const [rows] = await q.sequelize.query(
    'SELECT COUNT(*) AS count FROM photoStudioCreditBuckets WHERE guestId IS NOT NULL OR kind = "claimed_trial"',
  );
  if (Number(rows[0].count))
    throw new Error(
      "Claim/expire guest trials before downgrading; claimed trial balances require an explicit migration plan",
    );
  const hasFiles = await q.tableExists("photoStudioFiles");
  const [files] = hasFiles
    ? await q.sequelize.query("SELECT COUNT(*) AS count FROM photoStudioFiles")
    : [[{ count: 0 }]];
  const [envs] = await q.sequelize.query(
    "SELECT userId FROM photoStudioEnvironments WHERE userId IS NOT NULL GROUP BY userId HAVING COUNT(*) > 1",
  );
  if (Number(files[0].count) || envs.length)
    throw new Error(
      "Private image files and transferred environments require an explicit downgrade plan",
    );
  if (hasFiles) await q.dropTable("photoStudioFiles");
  // removeColumn drops the guest foreign key and its index in the correct order.
  for (const table of [...ownedTables].reverse()) {
    for (const event of ["insert","update"]) await q.sequelize.query(`DROP TRIGGER IF EXISTS ${table}_owner_${event}`);
    const columns = await q.describeTable(table);
    if (columns.guestId) await q.removeColumn(table, "guestId");
    await q.changeColumn(table, "userId", { type: S.UUID, allowNull: false });
  }
  await q.addIndex("photoStudioEnvironments", ["userId"], {
    unique: true, name: "photoStudioEnvironments_userId_unique",
  });
  await q.removeIndex("photoStudioEnvironments", "photoStudioEnvironments_userId_lookup");
  await q.dropTable("guestSessions");
  // Optional environments are retained on downgrade to avoid invalidating account work.
};
