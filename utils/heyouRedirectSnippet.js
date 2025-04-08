const overWriteGetStartedButton = (buttonSelectors = []) => {
  console.log(`custom js is triggered at ${new Date()}`);
  if (window?.innerWidth < 801) {
    return;
  }

  buttonSelectors.forEach((buttonSelector, idx) => {
    const curButton = document.querySelector(buttonSelector);
    if (curButton) {
      const PREV_LINK = curButton?.href;
      curButton.href = "#";
      curButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        curButton.style.display = "flex";
        curButton.style.justifyContent = "center";
        curButton.style.pointerEvents = "none";

        const spinner = document.createElement("div");
        spinner.style.border = "4px solid #fff";
        spinner.style.borderRadius = "50%";
        spinner.style.borderTop = "4px solid #ca4ef9";
        spinner.style.width = "20px";
        spinner.style.height = "20px";

        var rotation = 0;

        function animateSpinner() {
          spinner.style.transform = "rotate(" + rotation + "deg)";
          rotation += 2;
          requestAnimationFrame(animateSpinner);
        }

        animateSpinner();

        // Clear existing content of the link
        curButton.innerHTML = "";

        // Append the spinner to the link
        curButton.appendChild(spinner);

        const heyouParams = new URL(window?.location?.href).search;
        const heyouSearchParams = new URLSearchParams(
          new URL(window?.location?.href).search
        );

        const paramReferrer = heyouSearchParams.get(`utm_source`);

        let FINAL_LINK_WITH_PARAMS = ``;

        if (paramReferrer) {
          FINAL_LINK_WITH_PARAMS = `https://join.heyou.io${heyouParams}`;
        } else {
          FINAL_LINK_WITH_PARAMS = `https://join.heyou.io/?utm_source=${
            document?.referrer || "Unknown"
          }${heyouParams?.replaceAll(`?`, ``)}`;
        }

        // - Inject heyou Iframe
        const mainIframe = document.createElement("iframe");
        mainIframe.src = FINAL_LINK_WITH_PARAMS;

        mainIframe.width = "500px";
        mainIframe.height = "500px";
        mainIframe.style.display = "none";

        mainIframe.addEventListener("load", () => {
          const curIframeLoadedUrl = mainIframe?.src;

          if (
            curIframeLoadedUrl &&
            curIframeLoadedUrl?.includes("join.heyou.io")
          ) {
            setTimeout(() => {
              window.location = PREV_LINK;
            }, 3000);
          }
        });

        document.body.appendChild(mainIframe);
      });
    }
  });
};

document.addEventListener("DOMContentLoaded", function () {
  // UPDATE HERE ADDED ALL BUTTONS THAT GO TO EXTENSION PAGE
  overWriteGetStartedButton([
    ".hero__wrap .hero__content .wp-block-buttons .wp-block-button__link",
    "#site-navigation .wp-block-button .wp-block-button__link",
    "#how-works .wp-block-button__link",
    "#pricing .wp-block-button__link",
    "#site-footer .open-pop-up",
  ]);
});
