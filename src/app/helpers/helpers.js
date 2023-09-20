export const truncate = (string, length) => {
  if (string.length > length) {
    if (length > 3) {
      return string.substring(0, length - 3) + "..."
    } else {
      return string.substring(0, length);
    }
  } else {
    return string;
  }
}
