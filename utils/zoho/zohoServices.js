import { getAccessTokenFromRefreshToken } from "./zohoAuth.js";
import axios from "axios";
import dotenv from "dotenv";
import Users from "../../mongodb/models/Users.js";
import Accounts from "../../mongodb/models/Accounts.js";
import * as Sentry from "@sentry/node";

dotenv.config();
const AC_BASE_URL = `${process.env.ACTIVE_CAMPAIGN_API_URL}/api/3`;
const ACTIVE_CAMPAIGN_API_KEY = process.env.ACTIVE_CAMPAIGN_API_KEY;
const ADMIN_CRM_URL =
  process?.env?.ADMIN_CRM_URL || `https://heyou.activehosted.com`;

let REFRESH_TOKEN = process.env.RERESH_TOKEN;

const createAccount = async (leadData) => {
  try {
    const accessToken = await getAccessTokenFromRefreshToken(REFRESH_TOKEN);
    const response = await axios({
      method: "post",
      url: "https://www.zohoapis.com/crm/v2/Accounts",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      data: {
        data: [leadData],
      },
    });

    logGracefulMessage({
      status: "Success",
      accountId: "",
      message: `Successfully created account`,
      userId: "",
      method: "createAccount",
    });

    return response.data;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: "",
      message: error?.message,
      userId: "",
      method: "createAccount",
    });
  }
};

async function getMainContactFromRecord(recordId) {
  try {
    const accessToken = await getAccessTokenFromRefreshToken(REFRESH_TOKEN);

    const response = await axios({
      method: "get",
      url: `https://www.zohoapis.com/crm/v2/Accounts/${recordId}`,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });

    const mainContact = response.data?.data?.[0]?.Main_Contact;
    return mainContact || null;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `getMainContactFromRecord`,
    });
    return null;
  }
}

// not a route - help function
const searchAccount = async (companyName) => {
  try {
    // todo actually its should be search by companyName
    const searchResult = await axios({
      method: "GET",
      url: `${AC_BASE_URL}/accounts/${zohoAccountId}`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
      data: {
        contact,
      },
    });

    if (searchResult?.data?.account && searchResult.data?.account?.id) {
      logGracefulMessage({
        status: "Success",
        accountId: ``,
        userId: ``,
        message: `Searched Account successfully`,
        method: `searchAccount`,
      });

      return searchResult.data.account.id;
    } else {
      return null;
    }
  } catch (e) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${e?.message}`,
      method: `searchAccount`,
    });
  }
};

const EditAccountInZoho = async (zohoAccountId, contact) => {
  try {
    const updateResponse = await axios({
      method: "PUT",
      url: `${AC_BASE_URL}/accounts/${zohoAccountId}`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
      data: {
        contact,
      },
    });

    logGracefulMessage({
      status: "Success",
      accountId: contact?.accountId || "",
      message: `CRM account updated successfully`,
      userId: contact?._id || "",
      method: "EditAccountInZoho",
    });

    // todo handle the new response in the markting extenstion
    return updateResponse.data;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: contact?.accountId || "",
      message: error?.message,
      userId: contact?._id || "",
      method: "EditAccountInZoho",
    });
  }
};
const createOrUpdateContact = async (contact) => {
  try {
    try {
      // console.log(contact);
      if (!contact?.crmId) {
        throw new Error("Contact doesnt have crmId or not found.");
      }
      const searchResult = await axios({
        method: "GET",
        url: `${AC_BASE_URL}/contacts/${contact.crmId}`,
        headers: {
          "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
          accept: "application/json",
          "content-type": "application/json",
        },
      });
      // console.log(searchResult.data);
      if (searchResult?.data?.email || searchResult?.data?.contact?.email) {
        const updateResponse = await axios({
          method: "PUT",
          url: `${AC_BASE_URL}/contacts/${contact.crmId}`,
          headers: {
            "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
            accept: "application/json",
            "content-type": "application/json",
          },
          data: {
            contact,
          },
        });
        // console.log(updateResponse.data);
        if (!updateResponse?.data) {
          throw new Error("Failed to update contact in crm");
        }
        return { id: contact.crmId, data: updateResponse.data };
      }
    } catch (e) {
      const createResponse = await axios({
        method: "POST",
        url: `${AC_BASE_URL}/contacts`,
        headers: {
          "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
          accept: "application/json",
          "content-type": "application/json",
        },
        data: {
          contact,
        },
      });
      // console.log("***** create * contact response **** data");
      // console.log(createResponse);
      if (!createResponse?.data?.contact?.id) {
        throw new Error(`Failed to create contact in CRM`);
      }

      return {
        id: createResponse.data.contact.id,
        data: createResponse,
      };
    }
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: `${contact?._id}`,
      accountId: `${contact?.accountId}`,
      method: `createOrUpdateContact`,
    });
  }
};

const createOrUpdateAccount = async (account, update = true) => {
  try {
    try {
      if (!account?.crmId) {
        throw new Error("Account doesnt have crmId or not found.");
      }

      const searchResult = await axios({
        method: "GET",
        url: `${AC_BASE_URL}/accounts/${account.crmId}`,
        headers: {
          "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
          accept: "application/json",
          "content-type": "application/json",
        },
      });

      if (searchResult?.data) {
        if (!update) return { id: account.crmId };

        const updateResponse = await axios({
          method: "PUT",
          url: `${AC_BASE_URL}/accounts/${account.crmId}`,
          headers: {
            "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
            accept: "application/json",
            "content-type": "application/json",
          },
          data: {
            account,
          },
        });

        if (!updateResponse?.data) {
          throw new Error("Failed to update account in crm");
        }
        return { id: account.crmId, data: updateResponse.data };
      }
    } catch (e) {
      const createResponse = await axios({
        method: "POST",
        url: `${AC_BASE_URL}/accounts`,
        headers: {
          "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
          accept: "application/json",
          "content-type": "application/json",
        },
        data: {
          account,
        },
      });
      // console.log("***** create * contact response **** data");
      // console.log(createResponse);
      if (!createResponse?.data?.account?.id) {
        throw new Error(`Failed to create contact in CRM`);
      }

      return {
        id: createResponse.data.account.id,
        data: createResponse,
      };
    }
  } catch (error) {
    // handle duplicate
    try {
      const id = await getAccountIdByName(account.company);
      if (!id) throw new Error("account not found by company name in the crm");

      logGracefulMessage({
        status: "Success",
        accountId: `${account?._id}`,
        userId: ``,
        message: `Found Account Id by name`,
        method: `getACcountIdByName`,
      });

      return { id: id };
    } catch (e) {
      logGracefulMessage({
        status: "Error",
        accountId: `${account?._id}`,
        userId: ``,
        message: `${e?.message}`,
        method: `getACcountIdByName`,
      });
    }
  }
};

async function getListOfAccountsCrm() {
  try {
    const accounts = await axios({
      method: "GET",
      url: `${AC_BASE_URL}/accounts/?limit=10000000000`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
      },
    });

    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `Accounts fetched successfully`,
      method: `getListOfAccountsCrm`,
    });

    return accounts;
  } catch (e) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${e?.message}`,
      method: `getListOfAccountsCrm`,
    });
  }
}


const deleteAccountsBulk = async (accountIds) => {
  try {
    // Prepare query parameters in the format ids[]=123&ids[]=456&ids[]=789
    const errorLists = [];
    const dataList = []
    for (const crmAccId of accountIds) {
      if(!crmAccId) {
        continue;
      }
      const response = await fetch(`${AC_BASE_URL}/accounts/${crmAccId *1}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Api-Token': ACTIVE_CAMPAIGN_API_KEY 
        }
      });
  
      // Check if the response is successful
      if (!response.ok) {
       errorLists.push(response?.statusText)
      }
  
      // Parse and log the response body
      const data = await response.json();
  
      dataList.push(data)
    }
    // Send the DELETE request to ActiveCampaign API with query params
    
  } catch (error) {
    console.log('Error in bulk delete:');
  }
};

const deleteCrmUserById = async (userId) => {
  try {
    if(!userId) {
      return 0
    }
    // Send the DELETE request to ActiveCampaign API to delete the user by ID
    const response = await fetch(`${AC_BASE_URL}/contacts/${userId*1}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Api-Token': ACTIVE_CAMPAIGN_API_KEY // Replace with your actual API key
      }
    });

    // Check if the response is successful
    if (!response.ok) {
      console.log(`Failed to delete user: ${response.statusText}`);
    }

    // Parse and log the response body
    const data = await response.json();
    

    return data; // Return the response data for further processing if needed
  } catch (error) {
    console.log('Error deleting user:');
  }
};

async function getAllCustomFields() {
  try {
    const fields = await axios({
      method: "GET",
      url: `${AC_BASE_URL}/fields/?limit=10000`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
      },
    });

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `Fields fetched successfully`,
      method: `getAllCustomFields`,
    });

    return fields;
  } catch (e) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${e?.message}`,
      method: `getAllCustomFields`,
      payload: null,
      response: e,
    });
  }
}
async function getAllCustomFieldsAccount() {
  try {
    const fields = await axios({
      method: "GET",
      url: `${AC_BASE_URL}/accountCustomFieldMeta/?limit=10000`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
      },
    });

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `Fields fetched successfully`,
      method: `getAllCustomFieldsAccount`,
    });

    return fields;
  } catch (e) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${e?.message}`,
      method: `getAllCustomFieldsAccount`,
      payload: null,
      response: e,
    });
  }
}

async function getAccountIdByName(companyName) {
  try {
    // Get the list of accounts from the CRM
    const response = await getListOfAccountsCrm();
    const accounts = response.data.accounts;

    // Find the account that matches the given company name
    const matchedAccount = accounts.find(
      (account) =>
        account?.name.trim()?.toLowerCase() ===
        companyName?.trim()?.toLowerCase()
    );

    logGracefulMessage({
      status: "Error",
      accountId: "",
      message: `${companyName} | CRM account found successfully`,
      userId: "",
      method: "getAccountIdByName",
    });

    // Return the ID of the matched account or null if not found
    return matchedAccount ? matchedAccount.id : null;
  } catch (e) {
    logGracefulMessage({
      status: "Error",
      accountId: "",
      message: e?.message,
      userId: "",
      method: "getAccountIdByName",
    });
  }
}

import { SendMailClient } from "zeptomail";
import logGracefulMessage from "../logGracefulMessage.js";
import { updateAccountsContactsNumber } from "../../mutations/userMutations.js";
import { response } from "express";

const url = "api.zeptomail.com/";
const token = process.env.ZOHO_ENCZ_API_KEY;
let client = new SendMailClient({ url, token });

const sendVerificationEmail = async (
  verificationCode,
  userEmail,
  userName = ""
) => {
  const emailBody = `
    <!DOCTYPE html>
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your login</title>
      <!--[if mso]><style type="text/css">body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }</style><![endif]-->
    </head>
    <body style="font-family: Helvetica, Arial, sans-serif;">
    <table role="presentation"
    style="width: 100%; border-collapse: collapse; border: 0px; border-spacing: 0px; font-family: Arial, Helvetica, sans-serif; background-color: rgb(239, 239, 239);">
    <tbody>
      <tr>
        <td align="center" style="padding: 1rem 2rem; vertical-align: top; width: 100%;">
          <table role="presentation" style="max-width: 600px; border-collapse: collapse; border: 0px; border-spacing: 0px; text-align: left;">
            <tbody>
              <tr>
                <td style="padding: 40px 0px 0px;">
                  <div style="text-align: left;">
                    <div style="padding-bottom: 20px;"><img src="https://i.ibb.co/kHCbYDq/Heyou-Logo.jpg" alt="Company" style="width: 120px; border-radius: 5px"></div>
                  </div>
                  <div style="padding: 20px; background-color: rgb(255, 255, 255);">
                    <div style="color: rgb(0, 0, 0); text-align: left;">
                      <h1 style="margin: 1rem 0">Verification code</h1>
                      <p style="padding-bottom: 16px">Please use the verification code below to sign in.</p>
                      <p style="padding-bottom: 16px"><strong style="font-size: 130%">${verificationCode}</strong></p>

                      <p style="padding-bottom: 16px">If you didn’t request this, you can ignore this email.</p>
                      <p style="padding-bottom: 16px">Thanks,<br>Heyou team</p>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
    </body>
    </html>
  `;

  try {
    await client.sendMail({
      from: {
        address: "noreply@heyou.io",
        name: "noreply",
      },
      to: [
        {
          email_address: {
            address: userEmail,
            name: userName,
          },
        },
      ],
      subject: "Verify your login",
      htmlbody: emailBody,
    });

    logGracefulMessage({
      status: "Success",
      accountId: "",
      message: `Verification email sent successfully`,
      userId: "",
      method: "sendVerificationEmail",
    });

    // console.log("Verification email sent successfully");
    return verificationCode; // Return the code for further processing (e.g., saving to the database)
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: "",
      message: error?.message,
      userId: "",
      method: "sendVerificationEmail",
    });
  }
};

const deleteZohoUser = async (zohoAccountId) => {
  try {
    const deleteResponse = await axios({
      method: "DELETE",
      url: `${AC_BASE_URL}/contacts/${zohoAccountId}`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
    });

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `Zoho user deleted successfully`,
      method: `deleteZohoUser`,
    });

    return deleteResponse?.data;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${error?.message}`,
      method: `deleteZohoUser`,
    });
  }
};

const deleteZohoAccount = async (zohoAccountId) => {
  try {
    const deleteResponse = await axios({
      method: "DELETE",
      url: `${AC_BASE_URL}/accounts/${zohoAccountId}`,
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
    });

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `Zoho account deleted successfully`,
      method: `deleteZohoAccount`,
    });

    return deleteResponse?.data;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `${error?.message}`,
      method: `deleteZohoAccount`,
    });
  }
};

const findIdFromfields = async (fromProperties = []) => {
  try {
    const customFields = await getAllCustomFields();
    const customFieldsAcc = await getAllCustomFieldsAccount();
    const allFields = customFields?.data?.fields;
    const allFieldsAcc = customFieldsAcc?.data?.accountCustomFieldMeta;

    const DEFAULT_PERSTAGS = {
      linkForInvitedUser: "INVITE_LINK",
      shareLink: "SHARE_LINK_ENDUSER",
      role: "USER_TYPE",
      status: "PRODUCT_STATUS",
      companySize: "COMPANY_SIZE",
      userProfileUrl: "LINKEDIN_URL",
      countryRegion: "COUNTRYREGION",
      region: "COUNTRYREGION",
      leadSource: "LEAD_SOURCE",
      noOfContacts: "ACCT_NUMBER_OF_CONTACTS",
      thisMonthLikes: "THIS_MONTHS_LIKES",
      lastMonthLikes: "LAST_MONTHS_LIKES",
      thisMonthName: "THIS_MONTHS_NAME",
      lastMonthName: "LAST_MONTHS_NAME",
      percentageChange: "LIKES_PERCENTAGE_CHANGE",
      lastLikeInsightsSyncDate: "LIKES_INSIGHTS_LAST_SYNC_DATE",
      lastSeen: "LAST_SEEN_DATE",
      installStatus: "INSTALLATION_STATUS",
      designation: "DESIGNATION",
      linkSource: "LINK_SOURCE",
      jobTitle: "JOB_TITLE",
      companyOwner: "ACCOUNT_OWNER_NAME",
      companyName: "ACCOUNT_NAME",
      profileLanguage: "LANGUAGE",
      noOfSignUps: "ACCT_NO_OF_SIGNUPS",
      inviterName: "ACCOUNT_INVITER_NAME",
      utm_medium: "LINK_UTM_MEDIUM",
      utm_campaign: "LINK_UTM_CAMPAIGN",
      cardToken: "BILLING_CARD_TOKEN",
      cardExpiryMonth: "BILLING_CARD_EXPIRY_MONTH",
      cardExpiryYear: "BILLING_CARD_EXPIRY_YEAR",
      plan: "ACCT_PLAN",
      noOfContactsInAccount: "NO_OF_CONTACTS_IN_ACCOUNT",
      paymentLink: "PAYMENT_LINK",
      secondAccountName: "SECOND_ACCOUNT_NAME",
      noOfContactsInSecondAccount: "SECOND_ACCOUNT_CONTACTS",
      thirdAccountName: "THIRD_ACCOUNT_NAME",
      noOfContactsInThirdAccount: "THIRD_ACCOUNT_CONTACTS",
      lastFrontLikeDate: "LAST_FRONT_LIKE",
      onBoardingFailReason: "ONBOARDING_FAIL_REASON",
      thisMonthsDailyLikes: "CURRENT_MONTH_LIKES",
      totalLikes: "TOTAL_LIKES",
      currentMonthPosts: "ACCT_CURRENT_MONTH_POSTS",
      totalPosts: "ACCT_TOTAL_POSTS",
      totalLikesForThisMonthAcc: "ACCT_CURRENT_MONTH_LIKES",
      totalLikesAcc: "ACCT_TOTAL_LIKES",
      crmUrl: "CONTACTS_URL",
      lifetimeLikesAccountLevel: `LIFETIME_LIKES_ACCOUNT_LEVEL`,
      currentMonthLikesAccountLevel: `CURRENT_MONTH_LIKES_ACCOUNTS_LEVEL`,
      pendingInvitedUsers: `PENDING_INVITED_USERS`,
      accountPlan: `ACCOUNT_PLAN`,
    };

    let res = {};

    fromProperties?.map((fromField) => {
      const perstag = DEFAULT_PERSTAGS[fromField];

      if (!perstag) {
        res[fromField] = null;
      } else {
        const foundField = allFields?.find(
          (field) => field.perstag === perstag
        );

        res[fromField] = foundField?.id;
      }

      if (!res[fromField]) {
        // check in accounts
        const foundField = allFieldsAcc?.find(
          (field) => field.personalization === perstag
        );

        res[fromField] = foundField?.id;
      }
    });

    return res;
  } catch (error) {
    //
    throw new Error(error?.message);
  }
};

const updateNoOfAccInCrm = async (
  accountCrmId,
  noOfContacts = 0,
  noOfSignUps = 1
) => {
  try {
    const fieldRes = await findIdFromfields(["noOfContacts", "noOfSignUps"]);

    const accRes = await fetch(`${AC_BASE_URL}/accounts/${accountCrmId}`, {
      method: "PUT",
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account: {
          fields: [
            {
              customFieldId: `${fieldRes?.noOfContacts}`,
              fieldValue: noOfContacts,
            },
            {
              customFieldId: `${fieldRes?.noOfSignUps}`,
              fieldValue: noOfSignUps,
            },
          ],
        },
      }),
    });
    return accRes;
  } catch (error) {
    //
    throw new Error(error?.message);
  }
};
const updateAccountInfo = async (accountInfo) => {
  try {
    const fieldRes = await findIdFromfields([
      "plan",
      "currentMonthPosts",
      "totalPosts",
      "totalLikesForThisMonthAcc",
      "totalLikesAcc",
    ]);

    if (!accountInfo?.crmId) {
      return "";
    }

    const accRes = await fetch(
      `${AC_BASE_URL}/accounts/${accountInfo?.crmId}`,
      {
        method: "PUT",
        headers: {
          "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          account: {
            fields: [
              {
                customFieldId: `${fieldRes?.totalLikesForThisMonthAcc}`,
                fieldValue: accountInfo?.totalLikesForThisMonth || 0,
              },
              {
                customFieldId: `${fieldRes?.totalLikesAcc}`,
                fieldValue: accountInfo?.totalLikes || 0,
              },
              {
                customFieldId: `${fieldRes?.currentMonthPosts}`,
                fieldValue: accountInfo?.currentMonthPosts || 0,
              },
              {
                customFieldId: `${fieldRes?.totalPosts}`,
                fieldValue: accountInfo?.totalPosts || 0,
              },
              {
                customFieldId: `${fieldRes?.plan}`,
                fieldValue: accountInfo?.plan || "Freemium",
              },
            ],
          },
        }),
      }
    );
    return accRes;
  } catch (error) {
    //
    throw new Error(error?.message);
  }
};

async function updateZohoContactAndAccount(accountInfo, userInfo) {
  try {
    if (accountInfo?.company) {
      const account = {
        name: accountInfo.company,
      };

      // if (accountInfo?.officialLinkedInCompanyUrl)
      //   account.Company_LI_Domain = accountInfo.officialLinkedInCompanyUrl;
      if (accountInfo?.crmId) account.crmId = accountInfo.crmId;
      // if (accountInfo?.adminEmail)
      //   account.Admin_Email = accountInfo.adminEmail;
      // if (accountInfo?.usersCounter) {
      //   account.Account_Number = accountInfo.usersCounter?.toString();
      // } else {
      //   account.Account_Number = "1";
      // }
      const crmAccount = await createOrUpdateAccount(account);
      if (crmAccount?.id) {
        const modifier = {
          $set: { crmId: crmAccount.id },
        };
        await Accounts.updateOne({ _id: accountInfo._id }, modifier);
      } else {
        throw new Error("Failed to create or update account in ZOHO crm");
      }
    }

    if (userInfo?.email && userInfo?.accountId) {
      // email its required now
      // if (userInfo?.accountId) { // if user doesnt have account id it means there is no account in the crm

      const accounts = await Accounts.find({ _id: userInfo?.accountId });
      if (accounts && accounts.length > 0) {
        const accountByDB = accounts[0];

        // Extract the crmId from the account
        const accountCrmId = accountByDB.crmId;

        if (accountCrmId) {
          // todo get the crmId of the account in our db
          // if doesnt exist so we should create an account -> store the id of the crm created in the account db and use this db to the company field here
          const contact = {
            email: userInfo.email || "placeholder@example.com", // Fallback to a placeholder if no email
            firstName:
              userInfo.firstName || userInfo.email?.split("@")[0] || "Unknown",
            lastName: userInfo.lastName || "Unknown",

            // phone: userInfo.phone || "", // Add if available
            crmId: userInfo.crmId || "",
            organization: accountCrmId,
            fieldValues: [
              // Add more custom fields as necessary
            ],
          };

          const curFieldIdsRes = await findIdFromfields([
            "role",
            "shareLink",
            "linkForInvitedUser",
            "lastSeen",
            "installStatus",
            "region",
          ]);

          if (userInfo?.region && curFieldIdsRes?.region) {
            contact.fieldValues.push({
              field: ` ${curFieldIdsRes?.region}`,
              value: userInfo?.region,
            });
          }
          if (userInfo?.installedAt && curFieldIdsRes?.installStatus) {
            contact.fieldValues.push({
              field: ` ${curFieldIdsRes?.installStatus}`,
              value: userInfo?.uninstalledAt ? "Uninstalled" : "Installed",
            });
          }

          if (userInfo?.lastSeen && curFieldIdsRes?.lastSeen) {
            contact.fieldValues.push({
              field: ` ${curFieldIdsRes?.lastSeen}`,
              value: userInfo?.lastSeen,
            });
          }

          if (userInfo?.role && curFieldIdsRes?.role) {
            contact.fieldValues.push({
              field: ` ${curFieldIdsRes?.role}`,
              value: userInfo.role === "Admin" ? "Admin" : "End-User",
            });
          }

          if (userInfo?.shareLink && curFieldIdsRes?.shareLink) {
            contact.fieldValues.push({
              field: `${curFieldIdsRes?.shareLinkId}`,
              value: userInfo.shareLink,
            });
          }

          if (
            userInfo?.linkForInvitedUser &&
            curFieldIdsRes?.linkForInvitedUser
          ) {
            contact.fieldValues.push({
              field: `${curFieldIdsRes?.linkForInvitedUserId}`,
              value: userInfo.linkForInvitedUser,
            });
          }

          // check if there is account in the crm by id
          let account = {
            crmId: accountCrmId,
            company: accountByDB.company,
          };
          const { id } = await createOrUpdateAccount(account, false);
          if (!id) {
            const modifier = {
              $unset: { crmId: "" }, // This line removes the 'crmId' field
            };
            await Accounts.updateOne({ _id: userInfo?.accountId }, modifier);
          } else {
            const modifier = {
              $set: { crmId: id }, // This line updage the 'crmId' field
            };
            await Accounts.updateOne({ _id: userInfo?.accountId }, modifier);
          }
          contact.organization = id;
          // if doesnt just remove the crmId for the account and return; wait 5 mins
          const crmUser = await createOrUpdateContact(contact);
          if (crmUser?.id) {
            const modifier = {
              $set: { crmId: crmUser.id },
            };
            try {
              await Users.updateOne({ _id: userInfo._id }, modifier);
            } catch (error) {
              logGracefulMessage({
                status: "Error",
                message: `${error?.message}`,
                userId: ``,
                accountId: ``,
                method: `updateZohoContactAndAccount`,
              });
            }
          } else {
            throw new Error("Failed to create or update contact in CRM crm");
          }
        }
      }

      logGracefulMessage({
        status: "Success",
        accountId: `${accountInfo?._id}`,
        userId: `${userInfo?._id}`,
        message: `Updated zoho contact and account successfully`,
        method: `updateZohoContactAndAccount`,
      });
    }
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: `${accountInfo?._id}`,
      userId: `${userInfo?._id}`,
      message: `${error?.message}`,
      method: `updateZohoContactAndAccount`,
    });
    Sentry.captureException(error);
  }
}

const updateUsersLastSeenStatusInCrm = async (
  userInfo,
  uninstalled = false
) => {
  try {
    const curFieldIdsRes = await findIdFromfields([
      "lastSeen",
      "installStatus",
    ]);

    const contact = {
      crmId: userInfo.crmId || "",
      fieldValues: [
        // Add more custom fields as necessary
      ],
    };

    if (userInfo?.installedAt && curFieldIdsRes?.installStatus) {
      contact.fieldValues.push({
        field: `${curFieldIdsRes?.installStatus}`,
        value: `${uninstalled ? "Uninstalled" : "Installed"}`,
      });
    }

    if (userInfo?.lastSeen && curFieldIdsRes?.lastSeen) {
      contact.fieldValues.push({
        field: ` ${curFieldIdsRes?.lastSeen}`,
        value: `${new Date(userInfo?.lastSeen)?.toDateString()}`,
      });
    }

    const crmUser = await createOrUpdateContact(contact);
  } catch (error) {
    console.log(JSON.stringify({
      message: `Error sending occured add or update contact`,
      error
    }))
  }
};

const getCrmIdForAccount = async (companyName) => {
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
    };
    const accountsSnap = await fetch(`${AC_BASE_URL}/accounts`, {
      method: "GET",
      headers: headers,
    });
    const accountsDt = await accountsSnap.json();

    let organizationAcc = accountsDt.accounts.find(
      (acc) => acc?.name?.toLowerCase()?.trim() === companyName?.trim()
    );

    return organizationAcc?.id;
  } catch (error) {
    //
    console.log(JSON.stringify({
      message: `Error sending occured add getCrmIdForAccount`,
      error
    }))
  }
};

const fetchAllAccounts = async () => {
  try {
    // Initial request to get the total number of accounts
    const limit = 100;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
    };

    const initialResponse = await axios.get(`${AC_BASE_URL}/accounts`, {
      method: "GET",
      headers: headers,
      params: {
        limit: 1,
      },
    });

    const totalAccounts = initialResponse.data.meta.total;
    const totalPages = Math.ceil(totalAccounts / limit);

    // Array of promises for each page request
    const promises = [];

    for (let i = 0; i < totalPages; i++) {
      const offset = i * limit;
      promises.push(
        axios.get(`${AC_BASE_URL}/accounts`, {
          method: "GET",
          headers: headers,
          params: {
            limit: limit,
            offset: offset,
          },
        })
      );
    }

    // Wait for all promises to resolve
    const responses = await Promise.all(promises);

    // Combine results from all pages
    const allAccounts = responses.flatMap((response) => response.data.accounts);

    return allAccounts;
  } catch (error) {
    console.log("Error retrieving accounts:", JSON.stringify(error));
    return [];
  }
};

const getCrmIdFromUserEmail = async (email) => {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
  };

  try {
    const response = await fetch(`${AC_BASE_URL}/contacts/?email=${email}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const data = await response.json();

    return data?.contacts?.[0]?.id || null;
  } catch (error) {
    return null;
  }
};

const addOrUpdateContactInCRM = async (
  userInfo,
  shouldAddIfNotExists = true
) => {
  try {
    const curAccId = userInfo?.companies?.filter(
      (company) => company?.isPrimary
    )[0]?.companyId;

    const curAcc = await Accounts.findById(curAccId);

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
    };

    const accountsDt = await fetchAllAccounts();

    // - This is for if user already has crm id then update that
    if (userInfo?.crmId) {
      const curCrmContactSnap = await fetch(
        `${AC_BASE_URL}/contacts/${userInfo?.crmId}`,
        {
          method: "GET",
          headers: headers,
        }
      );

      const curCrmContact = await curCrmContactSnap.json();
      if (curCrmContact?.contact) {
        const curFieldIdsRes = await findIdFromfields([
          "role",
          "shareLink",
          "linkForInvitedUser",
          "status",
          "userProfileUrl",
          "designation",
          "utm_medium",
          "utm_campaign",
          "jobTitle",
          "companyOwner",
          "companyName",
          "inviterName",
          "cardToken",
          "cardExpiryMonth",
          "cardExpiryYear",
          "noOfContactsInAccount",
          "paymentLink",
          "secondAccountName",
          "noOfContactsInSecondAccount",
          "thirdAccountName",
          "noOfContactsInThirdAccount",
          "lastFrontLikeDate",
          "installStatus",
          "onBoardingFailReason",
          "thisMonthsDailyLikes",
          "totalLikes",
          "crmUrl",
          "lifetimeLikesAccountLevel",
          "currentMonthLikesAccountLevel",
          "pendingInvitedUsers",
          "accountPlan",
        ]);

        // Example payload data (replace with your actual data)
        const payload = {
          contact: {
            firstName: userInfo?.firstName,
            lastName: userInfo?.lastName,
            email: userInfo?.email,
            organization: userInfo?.organization || curAcc?.crmId,
            fieldValues: [
              {
                field: `${curFieldIdsRes?.accountPlan}`,
                value: userInfo?.accountPlan || "Freemium",
              },
              {
                field: `${curFieldIdsRes?.designation}`,
                value: userInfo?.designation || "",
              },
              {
                field: `${curFieldIdsRes?.lifetimeLikesAccountLevel}`,
                value: userInfo?.lifetimeLikesAccountLevel || "0",
              },
              {
                field: `${curFieldIdsRes?.currentMonthLikesAccountLevel}`,
                value: userInfo?.currentMonthLikesAccountLevel || "0",
              },
              {
                field: `${curFieldIdsRes?.pendingInvitedUsers}`,
                value: userInfo?.pendingInvitedUsers ? "YES" : "NO",
              },
              {
                field: `${curFieldIdsRes?.inviterName}`,
                value: userInfo?.inviterName || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.crmUrl}`,
                value: userInfo?.crmUrl,
              },
              {
                field: `${curFieldIdsRes?.totalLikes}`,
                value: userInfo?.totalLikes,
              },
              {
                field: `${curFieldIdsRes?.thisMonthsDailyLikes}`,
                value: userInfo?.thisMonthsDailyLikes,
              },
              {
                field: `${curFieldIdsRes?.onBoardingFailReason}`,
                value: userInfo?.onBoardingFailReason,
              },
              {
                field: `${curFieldIdsRes?.installStatus}`,
                value: userInfo?.uninstalledAt ? "Uninstalled" : "Installed",
              },
              {
                field: `${curFieldIdsRes?.paymentLink}`,
                value: userInfo?.paymentLink || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.lastFrontLikeDate}`,
                value: userInfo?.lastFrontLikeDate,
              },
              {
                field: `${curFieldIdsRes?.secondAccountName}`,
                value: userInfo?.secondAccountName || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.noOfContactsInSecondAccount}`,
                value: userInfo?.noOfContactsInSecondAccount || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.thirdAccountName}`,
                value: userInfo?.thirdAccountName || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.noOfContactsInThirdAccount}`,
                value: userInfo?.noOfContactsInThirdAccount || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.cardToken}`,
                value: userInfo?.cardToken || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.noOfContactsInAccount}`,
                value: userInfo?.noOfContactsInAccount || "0",
              },
              {
                field: `${curFieldIdsRes?.cardExpiryMonth}`,
                value: userInfo?.cardExpiryMonth || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.cardExpiryYear}`,
                value: userInfo?.cardExpiryYear || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.role}`,
                value: userInfo.role === "Admin" ? "Admin" : "End-User",
              },
              {
                field: `${curFieldIdsRes?.utm_medium}`,
                value: userInfo?.utm_medium || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.utm_campaign}`,
                value: userInfo?.utm_campaign || "Not Found",
              },

              {
                field: `${curFieldIdsRes?.companyOwner}`,
                value: userInfo?.companyOwner,
              },
              {
                field: `${curFieldIdsRes?.companyName}`,
                value: userInfo?.companyName,
              },
              {
                field: `${curFieldIdsRes?.jobTitle}`,
                value: userInfo?.jobTitle || "Not Found",
              },
              {
                field: `${curFieldIdsRes?.linkForInvitedUser}`,
                value: userInfo?.linkForInvitedUser || null,
              },
              {
                field: `${curFieldIdsRes?.shareLink}`,
                value: userInfo?.shareLink || null,
              },
              {
                field: `${curFieldIdsRes?.status}`,
                value: userInfo?.status || null,
              },
              {
                field: `${curFieldIdsRes?.userProfileUrl}`,
                value: userInfo?.userProfileUrl || null,
              },
            ],
          },
        };

        const updateCurCrmContactRes = await fetch(
          `${AC_BASE_URL}/contacts/${userInfo?.crmId}`,
          {
            method: "PUT",
            headers: headers,
            body: JSON.stringify(payload),
          }
        );

        const fRes = await updateCurCrmContactRes?.json();

        if (!updateCurCrmContactRes.ok) {
          // throw new Error(
          //   `HTTP error! Status: ${
          //     updateCurCrmContactRes.status
          //   } ${JSON.stringify(fRes)}`
          // );
        }

        // return console.log("CRM user updated !!!");
        return "";
      }
    }

    // -If we only need to update the crm record not add it!
    if (!shouldAddIfNotExists) {
      console.log(
        `I will not update user ${userInfo?.email} | ${userInfo?._id} | ${userInfo?.crmId}`
      );
      return "";
    }

    let organizationAcc = accountsDt.find(
      (acc) => acc?.name?.toLowerCase() === curAcc?.company?.toLowerCase()
    );

    if (!organizationAcc?.id && curAcc?._id) {
      const accRes = await fetch(`${AC_BASE_URL}/accounts`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          account: {
            name: curAcc?.company,
            accountUrl: "",
            owner: "1",
          },
        }),
      });
      // console.log("ACc creation res", accRes);
      const createdAcc = await accRes.json();
      organizationAcc = createdAcc?.account;
    }

    const curFieldIdsRes = await findIdFromfields([
      "role",
      "shareLink",
      "linkForInvitedUser",
      "status",
      "userProfileUrl",
      "designation",
      "linkSource",
      "utm_medium",
      "utm_campaign",
      "region",
      "jobTitle",
      "companyOwner",
      "companyName",
      "profileLanguage",
      "inviterName",
      "cardToken",
      "cardExpiryMonth",
      "cardExpiryYear",
      "noOfContactsInAccount",
      "paymentLink",
      "secondAccountName",
      "noOfContactsInSecondAccount",
      "thirdAccountName",
      "noOfContactsInThirdAccount",
      "lastFrontLikeDate",
      "installStatus",
      "onBoardingFailReason",
      "thisMonthsDailyLikes",
      "totalLikes",
      "lifetimeLikesAccountLevel",
      "currentMonthLikesAccountLevel",
      "pendingInvitedUsers",
      "accountPlan",
    ]);

    // Example payload data (replace with your actual data)
    const payload = {
      contact: {
        firstName: userInfo?.firstName,
        lastName: userInfo?.lastName,
        email: userInfo?.email,
        organization: organizationAcc?.id,
        fieldValues: [
          {
            field: `${curFieldIdsRes?.accountPlan}`,
            value: userInfo?.accountPlan || "Freemium",
          },
          {
            field: `${curFieldIdsRes?.lifetimeLikesAccountLevel}`,
            value: userInfo?.lifetimeLikesAccountLevel || "0",
          },
          {
            field: `${curFieldIdsRes?.currentMonthLikesAccountLevel}`,
            value: userInfo?.currentMonthLikesAccountLevel || "0",
          },
          {
            field: `${curFieldIdsRes?.pendingInvitedUsers}`,
            value: userInfo?.pendingInvitedUsers ? "YES" : "NO",
          },
          {
            field: ` ${curFieldIdsRes?.totalLikes}`,
            value: userInfo?.totalLikes,
          },
          {
            field: ` ${curFieldIdsRes?.thisMonthsDailyLikes}`,
            value: userInfo?.thisMonthsDailyLikes,
          },
          {
            field: ` ${curFieldIdsRes?.onBoardingFailReason}`,
            value: userInfo?.onBoardingFailReason,
          },
          {
            field: ` ${curFieldIdsRes?.installStatus}`,
            value: userInfo?.uninstalledAt ? "Uninstalled" : "Installed",
          },
          {
            field: `${curFieldIdsRes?.paymentLink}`,
            value: userInfo?.paymentLink || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.lastFrontLikeDate}`,
            value: userInfo?.lastFrontLikeDate,
          },
          {
            field: `${curFieldIdsRes?.secondAccountName}`,
            value: userInfo?.secondAccountName || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.noOfContactsInSecondAccount}`,
            value: userInfo?.noOfContactsInSecondAccount || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.thirdAccountName}`,
            value: userInfo?.thirdAccountName || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.noOfContactsInThirdAccount}`,
            value: userInfo?.noOfContactsInThirdAccount || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.cardToken}`,
            value: userInfo?.cardToken || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.noOfContactsInAccount}`,
            value: userInfo?.noOfContactsInAccount || "0",
          },
          {
            field: `${curFieldIdsRes?.cardExpiryMonth}`,
            value: userInfo?.cardExpiryMonth || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.cardExpiryYear}`,
            value: userInfo?.cardExpiryYear || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.inviterName}`,
            value: userInfo?.inviterName || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.role}`,
            value: userInfo.role === "Admin" ? "Admin" : "End-User",
          },
          {
            field: `${curFieldIdsRes?.utm_medium}`,
            value: userInfo?.utm_medium || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.utm_campaign}`,
            value: userInfo?.utm_campaign || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.region}`,
            value: userInfo?.region || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.profileLanguage}`,
            value: userInfo?.profileLanguage || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.companyOwner}`,
            value: userInfo?.companyOwner,
          },
          {
            field: `${curFieldIdsRes?.companyName}`,
            value: userInfo?.companyName,
          },
          {
            field: `${curFieldIdsRes?.designation}`,
            value: userInfo?.designation || "",
          },
          {
            field: `${curFieldIdsRes?.jobTitle}`,
            value: userInfo?.jobTitle || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.linkSource}`,
            value: userInfo?.installSource || "Not Found",
          },
          {
            field: `${curFieldIdsRes?.linkForInvitedUser}`,
            value: userInfo?.linkForInvitedUser || null,
          },
          {
            field: `${curFieldIdsRes?.shareLink}`,
            value: userInfo?.shareLink || null,
          },
          {
            field: `${curFieldIdsRes?.status}`,
            value: userInfo?.status || null,
          },
          {
            field: `${curFieldIdsRes?.userProfileUrl}`,
            value: userInfo?.userProfileUrl || null,
          },
        ],
      },
    };

    const response = await fetch(`${AC_BASE_URL}/contacts`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    // console.log("response is ", response);

    const data = await response.json();

    if (!response.ok) {
      // Try CRM again
      const resposeTwo = await fetch(`${AC_BASE_URL}/contacts`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
      });

      const dt2 = await resposeTwo.json();

      if (!resposeTwo.ok) {
        throw new Error(
          `HTTP error! Status: ${resposeTwo.status} ${JSON.stringify(dt2)}`
        );
      }
    }

    // console.log(data);

    const updatedUserAcc = await Users.findByIdAndUpdate(
      userInfo?._id,
      {
        crmId: data?.contact?.id,
        crmUrl: `${ADMIN_CRM_URL}/app/contacts/${data?.contact?.id}`,
      },
      { new: true }
    ).lean();

    if (updatedUserAcc?.crmId && updatedUserAcc?.crmUrl) {
      await addOrUpdateContactInCRM(updatedUserAcc, false);
    }

    if (curAcc?._id) {
      await Accounts.findByIdAndUpdate(curAcc?._id, {
        crmId: organizationAcc?.id,
      });
      await updateAccountsContactsNumber(curAcc?._id);
    }

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userInfo?._id}`,
      message: `Added/Updated contact in CRM`,
      method: `addOrUpdateContactInCrm`,
    });
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${userInfo?._id}`,
      message: `${error?.message}`,
      method: `addOrUpdateContactInCrm`,
    });
    // Sentry.captureException(error);
  }
};

const createAccountInCRM = async (curAcc) => {
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
    };
    const accRes = await fetch(`${AC_BASE_URL}/accounts`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        account: {
          name: curAcc?.company,
          accountUrl: curAcc?.officialLinkedInCompanyUrl || "",
          owner: "1",
        },
      }),
    });
    // console.log("ACc creation res", accRes);
    const createdAcc = await accRes.json();

    if (!createdAcc?.account) {
      throw new Error(`Wasn't able to create account in CRM`);
    }

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: ``,
      message: `Added/Updated Account in CRM`,
      method: `addOrUpdateAccountInCrm`,
    });

    return createdAcc;
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: ``,
      message: `Added/Updated Account in CRM Failed`,
      method: `addOrUpdateAccountInCrm`,
    });
    return null;
  }
};

const updateUserCrmsCustomFields = async (
  userCrmId,
  fieldsToUpdate = {
    thisMonthLikes: "0",
    lastMonthLikes: "0",
    thisMonthName: "Feb",
    lastMonthName: "Jan",
    percentageChange: "0",
    lastLikeInsightsSyncDate: "",
  }
) => {
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
    };

    const cusFieldsToGetIdsFrom = Object.keys(fieldsToUpdate);

    const curFieldIdsRes = await findIdFromfields(cusFieldsToGetIdsFrom);

    const filedValuesToUpdate = Object.keys(fieldsToUpdate).map((key) => {
      return {
        field: curFieldIdsRes[key],
        value: fieldsToUpdate[key],
      };
    });

    const updatesToSend = {
      contact: {
        fieldValues: filedValuesToUpdate,
      },
    };

    const responseSnap = await fetch(`${AC_BASE_URL}/contacts/${userCrmId}`, {
      method: "PUT",
      headers: headers,
      body: JSON.stringify(updatesToSend),
    });

    const response = await responseSnap.json();

    if (!response?.fieldValues) {
      throw new Error(
        `Something went wrong while updating CRM fields for user ${userCrmId}`
      );
    }

    return {
      success: true,
      message: `Successfully updated CRM fields for user ${userCrmId}`,
      data: response,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

async function getFields() {
  axios
    .get(`${AC_BASE_URL}/fields`, {
      headers: {
        "Api-Token": ACTIVE_CAMPAIGN_API_KEY,
      },
    })
    .then((response) => {
      const fields = response.data.fields;
      // console.log(fields);
      // const inviteLinkField = fields.find(field => field.title === 'Invite Link');

      // if (inviteLinkField) {
      //   console.log('Invite Link Field ID:', inviteLinkField.id);
      // } else {
      //   console.log('Invite Link field not found');
      // }
    })
    .catch((error) => {
      logGracefulMessage({
        status: "Error",
        message: `${error?.message}`,
        userId: ``,
        accountId: ``,
        method: `getFields`,
      });
    });
}
// getFields()

export {
  getCrmIdForAccount,
  searchAccount,
  createAccount,
  getMainContactFromRecord,
  EditAccountInZoho,
  createOrUpdateContact,
  createOrUpdateAccount,
  sendVerificationEmail,
  deleteZohoUser,
  updateZohoContactAndAccount,
  addOrUpdateContactInCRM,
  deleteZohoAccount,
  getAllCustomFields,
  updateNoOfAccInCrm,
  getAllCustomFieldsAccount,
  updateUserCrmsCustomFields,
  updateUsersLastSeenStatusInCrm,
  updateAccountInfo,
  getCrmIdFromUserEmail,
  getAccountIdByName,
  getListOfAccountsCrm,
  createAccountInCRM,
  deleteAccountsBulk,
  deleteCrmUserById
};
