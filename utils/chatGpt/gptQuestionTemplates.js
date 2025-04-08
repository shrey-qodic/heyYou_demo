const getHashtagFromPostTemplate = (postDescription) => {
  return `
I want you to generate 5 HashTags from the following post description and give me it in a js array of strings.
Post description:
"${postDescription}"
`;
};

export { getHashtagFromPostTemplate };
