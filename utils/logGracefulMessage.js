const logGracefulMessage = ({
  status = "Success",
  method = "logGracefulError",
  userId = "unknown",
  accountId = "unknown",
  message = "Something went wrong!",
  payload = undefined,
  response = undefined,
  extensionVersion = "unknown",
} = {}) => {
  const userIdToLog =
    userId === "" || userId === "undefined" || userId === "null"
      ? "unknown"
      : userId;
  const accountIdToLog =
    accountId === "" || accountId === "undefined" || accountId === "null"
      ? "unknown"
      : accountId;
  if (payload || response) {
    return console.log(
      JSON.stringify({
        main_message: `heyou_status:${status} | heyou_method:${method} | heyou_message:${message} | user_id:${userIdToLog} | account_id:${accountIdToLog} | heyou_extensionVersion:${extensionVersion}`,
        additional_information: {
          payload,
          response,
        },
      })
    );
  }

  console.log(
    `heyou_status:${status} | heyou_method:${method} | heyou_message:${message} | user_id:${userIdToLog} | account_id:${accountIdToLog} | heyou_extensionVersion:${extensionVersion}`
  );
};

export default logGracefulMessage;
