import React from "react";

interface headingProps {
  heading: string;
}
const Heading: React.FC<headingProps> = ({ heading }) => {
  return <p className="font-semibold text-xl  pb-4">{heading}</p>;
};

export default Heading;
