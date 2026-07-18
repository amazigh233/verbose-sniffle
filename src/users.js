"use strict";

const bcrypt = require("bcrypt");

// Vaste dummy-hash (bcrypt cost 12 van weggegooide willekeurige bytes) zodat
// inlogpogingen met onbekende gebruikersnamen even lang duren als met
// bestaande; de bijbehorende plaintext bestaat niet meer.
const DUMMY_PASSWORD_HASH = "$2b$12$uB/GWSMI6O0Cdd7SLAj5U.DzqLjFOl4wVepFsrGsYF0buRyz7tjJG";

const ROLES = ["admin", "crm", "sales", "execution", "finance", "installer"];
const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  employeeId: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true
};

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (!ROLES.includes(role)) throw publicError("Kies een geldige accountrol.", 400);
  return role;
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email || "",
    employeeId: user.employeeId || null,
    role: user.role,
    active: Boolean(user.active),
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt
  };
}

function sessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    employeeId: user.employeeId || null
  };
}

function publicError(message, status) {
  return Object.assign(new Error(message), { status });
}

function passwordFromPayload(payload, required) {
  const password = String(payload.password || payload.newPassword || "");
  if (required && password.length < 8) {
    throw publicError("Wachtwoord moet minimaal 8 tekens bevatten.", 400);
  }
  if (password && password.length < 8) {
    throw publicError("Nieuw wachtwoord moet minimaal 8 tekens bevatten.", 400);
  }
  return password;
}

function mapUniqueUsernameError(error) {
  if (error && error.code === "P2002") {
    throw publicError("Deze gebruikersnaam bestaat al.", 409);
  }
  throw error;
}

async function ensureBootstrapAdmin(prisma, config) {
  const username = normalizeUsername(config.adminUsername);
  if (!username || !config.adminPasswordHash) return null;
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  const userCount = await prisma.user.count();
  if (userCount > 0) return null;
  return prisma.user.create({
    data: {
      username,
      passwordHash: config.adminPasswordHash,
      role: "admin",
      active: true
    }
  });
}

async function login(prisma, config, usernameValue, password) {
  await ensureBootstrapAdmin(prisma, config);
  const username = normalizeUsername(usernameValue);
  const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
  const validPassword = await bcrypt.compare(String(password || ""), user ? user.passwordHash : DUMMY_PASSWORD_HASH);
  if (!user || !user.active || !validPassword) {
    throw publicError("Inlognaam of wachtwoord is onjuist.", 401);
  }
  return sessionUser(user);
}

async function listUsers(prisma) {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: [{ active: "desc" }, { role: "asc" }, { username: "asc" }]
  });
  return users.map(serializeUser);
}

async function assertAdminCanChange(prisma, id, data) {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw publicError("Gebruiker niet gevonden.", 404);
  const wouldStopBeingActiveAdmin = current.active &&
    current.role === "admin" &&
    (data.active === false || (data.role && data.role !== "admin"));
  if (!wouldStopBeingActiveAdmin) return current;
  const remainingAdmins = await prisma.user.count({
    where: {
      id: { not: id },
      role: "admin",
      active: true
    }
  });
  if (!remainingAdmins) {
    throw publicError("Laatste actieve beheerder mag niet worden uitgeschakeld.", 400);
  }
  return current;
}

async function createUser(prisma, payload) {
  const username = normalizeUsername(payload.username);
  if (!username) throw publicError("Gebruikersnaam is verplicht.", 400);
  const password = passwordFromPayload(payload, true);
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.create({
      data: {
      username,
      email: String(payload.email || "").trim().toLowerCase(),
      passwordHash,
      role: normalizeRole(payload.role),
      active: payload.active === undefined ? true : Boolean(payload.active),
      employeeId: payload.employeeId || null
      },
      select: USER_SELECT
    });
    return serializeUser(user);
  } catch (error) {
    mapUniqueUsernameError(error);
  }
}

async function updateUser(prisma, id, payload) {
  const data = {};
  if (Object.prototype.hasOwnProperty.call(payload, "username")) {
    data.username = normalizeUsername(payload.username);
    if (!data.username) throw publicError("Gebruikersnaam is verplicht.", 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "role")) data.role = normalizeRole(payload.role);
  if (Object.prototype.hasOwnProperty.call(payload, "active")) data.active = Boolean(payload.active);
  if (Object.prototype.hasOwnProperty.call(payload, "email")) data.email = String(payload.email || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(payload, "employeeId")) data.employeeId = payload.employeeId || null;
  const password = passwordFromPayload(payload, false);
  if (password) data.passwordHash = await bcrypt.hash(password, 12);
  await assertAdminCanChange(prisma, id, data);
  try {
    const user = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
    return serializeUser(user);
  } catch (error) {
    mapUniqueUsernameError(error);
  }
}

async function updateMe(prisma, session, payload) {
  const current = await prisma.user.findUnique({ where: { id: session.id } });
  if (!current || !current.active) throw publicError("Gebruiker niet gevonden.", 404);
  const currentPassword = String(payload.currentPassword || "");
  const validPassword = await bcrypt.compare(currentPassword, current.passwordHash);
  if (!validPassword) throw publicError("Huidig wachtwoord is onjuist.", 401);
  const data = {};
  if (payload.username !== undefined) {
    data.username = normalizeUsername(payload.username);
    if (!data.username) throw publicError("Gebruikersnaam is verplicht.", 400);
  }
  const password = passwordFromPayload(payload, false);
  if (password) data.passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.update({ where: { id: current.id }, data, select: USER_SELECT });
    return serializeUser(user);
  } catch (error) {
    mapUniqueUsernameError(error);
  }
}

module.exports = {
  ensureBootstrapAdmin,
  listUsers,
  login,
  createUser,
  updateUser,
  updateMe,
  sessionUser,
  normalizeUsername,
  serializeUser
};
