import type { ComponentType, SVGProps } from 'react';
import {
  CustomerServiceIcon,
  DeliveryServiceIcon,
  MoneyBackIcon,
} from '@/assets/icons';


type ServiceIcon = ComponentType<SVGProps<SVGSVGElement>>;

type ServiceBenefit = {
  title: string;
  description: string;
  icon: ServiceIcon;
};

const benefits: ServiceBenefit[] = [
  {
    title: 'FREE AND FAST DELIVERY',
    description: 'Free delivery for all orders over $140',
    icon: DeliveryServiceIcon,
  },
  {
    title: '24/7 CUSTOMER SERVICE',
    description: 'Friendly 24/7 customer support',
    icon: CustomerServiceIcon,
  },
  {
    title: 'MONEY BACK GUARANTEE',
    description: 'We return money within 30 days',
    icon: MoneyBackIcon,
  },
];

export function ServiceBenefits() {
  return (
    <section
      aria-label="ShopNest service benefits"
      className="
        mx-auto
        w-full
        max-w-[943px]
        py-14
        font-poppins

        sm:py-16
        lg:py-20
      "
    >
      <div
        className="
          grid
          grid-cols-1
          gap-10

          sm:grid-cols-3
          sm:gap-6

          lg:gap-[88px]
        "
      >
        {benefits.map((benefit) => (
          <ServiceBenefitItem
            key={benefit.title}
            {...benefit}
          />
        ))}
      </div>
    </section>
  );
}

function ServiceBenefitItem({
  title,
  description,
  icon: Icon,
}: ServiceBenefit) {
  return (
    <article
      className="
        group
        flex
        min-w-0
        flex-col
        items-center
        text-center
      "
    >
      <div
        className="
          transition-transform
          duration-300
          ease-out

          group-hover:-translate-y-1
        "
      >
        <Icon
          aria-hidden="true"
          className="h-20 w-20"
        />
      </div>

      <div className="mt-6">
        <h3
          className="
            whitespace-nowrap
            text-[16px]
            font-semibold
            leading-6
            text-black

            sm:whitespace-normal

            lg:text-[20px]
            lg:leading-7
          "
        >
          {title}
        </h3>

        <p
          className="
            mt-2
            text-[12px]
            font-normal
            leading-[18px]
            text-black/70

            lg:text-[14px]
            lg:leading-[21px]
            lg:text-black
          "
        >
          {description}
        </p>
      </div>
    </article>
  );
}