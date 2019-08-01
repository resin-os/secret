RUN apt-get update && apt-get install -y --no-install-recommends \
  sudo \
  ca-certificates \
  findutils \
  gnupg \
  dirmngr \
  inetutils-ping \
  netbase \
  curl \
  udev \
  $( \
      if apt-cache show 'iproute' 2>/dev/null | grep -q '^Version:'; then \
        echo 'iproute'; \
      else \
        echo 'iproute2'; \
      fi \
  ) \
  && rm -rf /var/lib/apt/lists/*

RUN set -x \
  && buildDeps='git-core autoconf libtool automake build-essential debhelper fakeroot cmake dpkg-dev devscripts' \
  && apt-get update && apt-get install -y $buildDeps --no-install-recommends && rm -rf /var/lib/apt/lists/* \
  && git clone https://github.com/mdr78/libx1000.git \
  && cd libx1000 \
  && git checkout 1bfb62bb62e0ebe0e42817edd9702d91d232dbee \
  && cd libx1000-0.0.0 \
  && libtoolize --force \
  && aclocal \
  && autoheader \
  && automake --force-missing --add-missing \
  && autoconf \
  && ./autogen.sh \
  && ./configure \
  && make && make install \
  && apt-get purge -y --auto-remove $buildDeps \
  && cd / && rm -rf /libx1000