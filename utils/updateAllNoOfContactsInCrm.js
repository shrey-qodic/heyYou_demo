import Accounts from "../mongodb/models/Accounts.js";

import { updateAccountsContactsNumber } from "../mutations/userMutations.js";

const updateAllNoOfContactsInCrm = async () => {
  try {
    const allCompanies = await Accounts.find({ crmId: { $ne: null } });
    const dataToReturn = [];

    for (const company of allCompanies) {
      const currentCompanyId = company?._id;
      if (!company?.crmId) {
        return;
      }

      const curAc = await updateAccountsContactsNumber(currentCompanyId);
      dataToReturn.push(`${company?.company}`);
    }

    return {
      status: "success",
      message: `All accounts with CRM ID updated successfully`,
      updatedAccountContacts: dataToReturn,
    };
  } catch (error) {
    return {
      status: "false",
      message: `Failed to update accounts no of contacts successfully`,
      updatedAccountContacts: [],
    };
  }
};

export default updateAllNoOfContactsInCrm;
