import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';

import playstationImage from '@/assets/images/categories/clothing.png';
import womensCollectionImage from '@/assets/images/categories/womens-watches.png';
import speakersImage from '@/assets/images/categories/smartphones.png';
import perfumeImage from '@/assets/images/categories/fragrance.png';

type ArrivalCardProps = {
  title: string;
  description: string;
  href: string;
  image: StaticImageData;
  imageAlt: string;
  className?: string;
  imageClassName?: string;
  imageWrapperClassName?: string;
  contentClassName?: string;
  compact?: boolean;
  glow?: boolean;
};

const arrivals = {
  playstation: {
    title: 'PlayStation 5',
    description:
      'Black and White version of the PS5 coming out on sale.',
    href: '/shop?category=gaming',
    image: playstationImage,
    imageAlt: 'PlayStation 5 console and controller',
  },

  womensCollection: {
    title: 'Women’s Collections',
    description:
      'Featured woman collections that give you another vibe.',
    href: '/shop?category=womens-dresses',
    image: womensCollectionImage,
    imageAlt: 'Women’s fashion collection',
  },

  speakers: {
    title: 'Speakers',
    description: 'Amazon wireless speakers',
    href: '/shop?category=mobile-accessories',
    image: speakersImage,
    imageAlt: 'Wireless speakers',
  },

  perfume: {
    title: 'Perfume',
    description: 'Premium fragrances for every occasion',
    href: '/shop?category=fragrances',
    image: perfumeImage,
    imageAlt: 'Premium perfume bottle',
  },
} satisfies Record<
  string,
  Omit<
    ArrivalCardProps,
    | 'className'
    | 'imageClassName'
    | 'imageWrapperClassName'
    | 'contentClassName'
    | 'compact'
    | 'glow'
  >
>;

export function NewArrivals() {
  return (
    <section
      aria-labelledby="new-arrivals-heading"
      className="mx-auto w-full "
    >
      <SectionHeading />

      <div
        className="
          mt-3
          grid
          w-full
          gap-4

          lg:mt-5
          lg:grid-cols-2
          lg:gap-x-[30px]
          lg:gap-y-0
        "
      >
        {/* Large left card */}
        <ArrivalCard
          {...arrivals.playstation}
          className="
            min-h-[460px]

            sm:min-h-[520px]

            lg:h-[600px]
            lg:min-h-0
          "
          imageWrapperClassName="
            absolute
            inset-x-4
            top-[72px]
            bottom-0

            sm:inset-x-8

            lg:left-[29px]
            lg:right-[30px]
            lg:top-[89px]
            lg:h-[511px]
          "
          imageClassName="object-contain object-bottom"
          contentClassName="
            bottom-6 left-6

            sm:bottom-8 sm:left-8
          "
        />

        {/* Right side */}
        <div
          className="
            grid
            min-w-0
            gap-4

            lg:h-[600px]
            lg:grid-rows-[284px_284px]
            lg:gap-y-8
          "
        >
          <ArrivalCard
            {...arrivals.womensCollection}
            className="
              min-h-[270px]

              lg:h-[284px]
              lg:min-h-0
            "
            imageWrapperClassName="
              absolute
              bottom-0
              right-0
              top-0
              w-[76%]
            "
            imageClassName="
              object-contain
              object-right-bottom
            "
            contentClassName="
              bottom-6 left-6

              lg:bottom-6
              lg:left-6
            "
          />

          <div
            className="
              grid
              grid-cols-1
              gap-4

              sm:grid-cols-2

              lg:grid-cols-2
              lg:gap-x-[30px]
            "
          >
            <ArrivalCard
              {...arrivals.speakers}
              compact
              glow
              className="
                min-h-[284px]

                lg:h-[284px]
                lg:min-h-0
              "
              imageWrapperClassName="
                absolute
                left-1/2
                top-[26px]
                h-[210px]
                w-[210px]
                -translate-x-1/2
              "
              imageClassName="object-contain"
              contentClassName="bottom-5 left-6 right-5"
            />

            <ArrivalCard
              {...arrivals.perfume}
              compact
              glow
              className="
                min-h-[284px]

                lg:h-[284px]
                lg:min-h-0
              "
              imageWrapperClassName="
                absolute
                left-1/2
                top-[22px]
                h-[220px]
                w-[210px]
                -translate-x-1/2
              "
              imageClassName="object-contain"
              contentClassName="bottom-5 left-6 right-5"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading() {
  return (
    <header>
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="h-[40px] w-[4px] rounded-full bg-[#DB4444]"
        />

        <p className="text-[15px] font-semibold text-[#DB4444]">
          Featured
        </p>
      </div>

      <h2
        id="new-arrivals-heading"
        className="
          mt-4
          text-[28px]
          font-semibold
          leading-tight
          tracking-[0.01em]
          text-black

          sm:text-[32px]

          lg:text-[36px]
        "
      >
        New Arrival
      </h2>
    </header>
  );
}

function ArrivalCard({
  title,
  description,
  href,
  image,
  imageAlt,
  className = '',
  imageClassName = '',
  imageWrapperClassName = '',
  contentClassName = '',
  compact = false,
  glow = false,
}: ArrivalCardProps) {
  return (
    <article
      className={`
        group
        relative
        isolate
        overflow-hidden
        rounded-[4px]
        bg-black
        text-white

        ${className}
      `}
    >
      {glow && (
        <span
          aria-hidden="true"
          className="
            pointer-events-none
            absolute
            left-1/2
            top-1/2
            h-[196px]
            w-[196px]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-white/35
            blur-[90px]
          "
        />
      )}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          inset-0
          z-[1]
          bg-gradient-to-t
          from-black/80
          via-black/10
          to-transparent
        "
      />

      <div
        className={`
          pointer-events-none
          ${imageWrapperClassName}
        `}
      >
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes={
            compact
              ? '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 270px'
              : '(max-width: 1023px) 100vw, 570px'
          }
          quality={90}
          className={`
            select-none
            transition-transform
            duration-700
            ease-out
            group-hover:scale-[1.025]

            ${imageClassName}
          `}
        />
      </div>

      <div
        className={`
          absolute
          z-10
          flex
          max-w-[255px]
          flex-col

          ${compact ? 'gap-2' : 'gap-4'}

          ${contentClassName}
        `}
      >
        <div
          className={`
            flex flex-col

            ${compact ? 'gap-2' : 'gap-4'}
          `}
        >
          <h3
            className="
              text-[20px]
              font-semibold
              leading-6
              tracking-[0.03em]
              text-[#FAFAFA]

              sm:text-[22px]

              lg:text-[24px]
            "
          >
            {title}
          </h3>

          <p
            className={`
              font-poppins
              font-normal
              text-[#FAFAFA]/90

              ${
                compact
                  ? 'text-[12px] leading-[18px]'
                  : 'text-[13px] leading-5 sm:text-[14px] sm:leading-[21px]'
              }
            `}
          >
            {description}
          </p>
        </div>

        <ShopNowLink href={href} title={title} />
      </div>
    </article>
  );
}

function ShopNowLink({
  href,
  title,
}: {
  href: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`Shop ${title}`}
      className="
        group/link
        relative
        w-fit
        text-[14px]
        font-medium
        leading-6
        text-white

        sm:text-[15px]

        lg:text-[16px]
      "
    >
      Shop Now

      <span
        aria-hidden="true"
        className="
          absolute
          -bottom-[1px]
          left-0
          h-px
          w-full
          origin-left
          scale-x-100
          bg-white/50
          transition-all
          duration-300

          group-hover/link:scale-x-[0.65]
          group-hover/link:bg-white
        "
      />
    </Link>
  );
}