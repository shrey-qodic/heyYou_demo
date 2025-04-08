import Users from "../mongodb/models/Users.js";
import * as Sentry from "@sentry/node";
const extLogout = async (req, res) => {
  try {
    const params = req.params;
    // console.log("extLogout: started", { params });

    if (!params || !params?.removedCookie) {
      res.status(400).json({
        success: false,
        message:
          "Requet went through, but we did not get the parameter required",
      });
      res.end("");
      return;
    }
    /// check user with this cookie
    const fetchUser = await Users.findOne({
      cookie: { $regex: params?.removedCookie, $options: "i" },
    });
    // console.log(fetchUser);
    if (!fetchUser) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      res.end("");
      return;
    }

    const isUninstall = !req.headers.origin;
    const modifier = {
      $unset: { cookie: 1 },
      $set: { uninstalledAt: new Date() },
    };
    // console.log("is uninstall?? ", isUninstall);
    // console.log("modifier ", modifier);
    let resString = "";
    if (isUninstall) {
      // just uninstalled
      modifier.$set.uninstallReason = "Extension Removed";
      resString = `
      <h1>HeYou uninstalled</h1>
      <p>HeYou internal services will stop now.</p>
    `;
    } else {
      // logout linkedin
    }
    // res.status(200).json({
    //   success: true,
    //   message: "Successful",
    // });
    await Users.updateOne({ _id: fetchUser?._id }, modifier);
    res.end(resString);
  } catch (error) {
    Sentry.captureException(error);

    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

// const extInstalled = async (req, res) => {
//   try {
//     const params = req.params;
//     console.log("extInstalled: started", { params });

//     //   if (!params || !params?.currentCookie) {
//     //     res.status(500).json({
//     //       success: false,
//     //       message:
//     //         "Requet went through, but we did not get the parameter required",
//     //     });
//     //     res.end("");
//     //     return;
//     //   }
//     //   /// check user with this cookie
//     //   const fetchUser = await Users.findOne({
//     //     cookie: { $regex: params?.currentCookie, $options: "i" },
//     //   });
//     //   console.log(fetchUser);
//     //   if (!fetchUser) {
//     //     res.status(404).json({
//     //       success: false,
//     //       message: "User not found",
//     //     });
//     //     res.end("");
//     //     return;
//     //   }

//     //   const isUninstall = !req.headers.origin;
//     //   const modifier = {
//     //     $unset: { cookie: 1 },
//     //     $set: { uninstalledAt: new Date() },
//     //   };
//     //   console.log("is uninstall?? ", isUninstall);
//     //   console.log("modifier ", modifier);
//     //   if (isUninstall) {
//     //     // just uninstalled
//     //   } else {
//     //     // logout linkedin
//     //   }
//     res.status(200).json({
//       success: true,
//       message: "Successful",
//     });
//     res.end("");
//   } catch (error) {
//     Sentry.captureException(error);
//     console.log("extInstalled: failed", { errorMessage: error?.message });
//     res.status(500).json({ message: error?.message });
//     res.end("");
//   }
// };
export { extLogout };
