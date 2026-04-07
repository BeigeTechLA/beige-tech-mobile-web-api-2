const allRoles = {
  user: [],
  admin: ["getUsers", "manageUsers", "getServiceIncludes", "manageServiceIncludes", "getShootTypes", "manageShootTypes"],
  cp: ["getServiceIncludes", "manageServiceIncludes", "getShootTypes"],
  pm: ["getServiceIncludes", "manageServiceIncludes", "getShootTypes", "manageOrders", "viewAllOrders"],
  sales_rep: ["createBooking", "viewOwnBookings", "overridePricing"],
};

const roles = Object.keys(allRoles);
const roleRights = new Map(Object.entries(allRoles));

module.exports = {
  roles,
  roleRights,
};
